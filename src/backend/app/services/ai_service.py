import json
import logging
import re
from typing import Any

from openai import AzureOpenAI

from src.backend.app.config import settings
from src.backend.app.services.nba_service import nba_service

logger = logging.getLogger(__name__)


def _nba_public_payload(nba: dict[str, Any]) -> dict[str, Any]:
    """Safe subset for API clients (omit large feature_row)."""
    return {
        "action_id": nba.get("action_id"),
        "title": nba.get("title"),
        "playbook": nba.get("playbook"),
        "score": nba.get("score"),
        "top_probabilities": nba.get("top_probabilities"),
        "top_alternatives": nba.get("top_alternatives"),
        "constraints": nba.get("constraints"),
        "model_ok": nba.get("model_ok"),
        "reason": nba.get("reason"),
    }


def _assistant_reply_plain_text(text: str) -> str:
    """Strip common Markdown so chat reads as plain operational prose."""
    if not text:
        return text
    s = text.strip()
    s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", s)
    s = re.sub(r"__([^_]+)__", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"^#{1,6}\s+", "", s, flags=re.MULTILINE)
    s = re.sub(r"\[(.*?)\]\([^)]+\)", r"\1", s)
    return s.strip()


def _completion_budget_kwargs(limit: int) -> dict[str, int]:
    """Azure gpt-4o+ uses max_completion_tokens; older chat models use max_tokens."""
    n = max(1, min(int(limit), 16384))
    if settings.azure_use_max_completion_tokens:
        return {"max_completion_tokens": n}
    return {"max_tokens": n}


class AIService:
    def __init__(self):
        self.client = None
        self.deployment = settings.azure_deployment

        # Only initialize client if credentials are provided
        if settings.azure_api_key and settings.azure_endpoint:
            try:
                self.client = AzureOpenAI(
                    api_key=settings.azure_api_key,
                    api_version=settings.azure_api_version,
                    azure_endpoint=settings.azure_endpoint,
                )
            except Exception as e:
                print(f"Warning: Failed to initialize Azure OpenAI client: {e}")

    def generate_recommendations(
        self,
        asset_data: dict[str, Any],
        context: dict[str, Any] | None = None,
        apply_constraints: bool = True,
    ) -> tuple[str, dict[str, Any]]:
        """
        Run the reliability model to pick the next-best-action, then ask the LLM
        for an operational narrative. The LLM must not contradict the model's
        primary action.

        ``apply_constraints`` toggles whether eligibility/safety rules filter
        the winner pool (True, default) or whether the raw model winner is
        returned and explained (False — used by the UI's "override" path).
        Returns (narrative_text, nba_public_dict).
        """
        nba = nba_service.predict(asset_data, apply_constraints=apply_constraints)
        nba_public = _nba_public_payload(nba)
        kpi_digest = (
            asset_data.get("kpiDigestForAi") or asset_data.get("kpi_digest_for_ai") or ""
        ).strip()
        cmms = (
            asset_data.get("cmmsWorkcenterRoles") or asset_data.get("cmms_workcenter_roles") or ""
        ).strip()

        nba_block = {
            "primary_next_best_action_id": nba.get("action_id"),
            "primary_title": nba.get("title"),
            "playbook": nba.get("playbook"),
            "top_probabilities": nba.get("top_probabilities"),
            "model_ok": nba.get("model_ok"),
        }

        system = """You are an expert maintenance analyst for PepsiCo.
The NEXT BEST ACTION has already been chosen by a trained reliability model. You must:
- Treat primary_title as the correct recommendation title; explain and expand it, never replace it
  with a different action.
- Write a long-form, management-ready narrative. Be specific: tie advice to KPIs, asset status,
  and any anomaly/RCA context in the payload.
- If an Executive KPI snapshot is provided, start with the exact heading "Based on these KPIs:"
  on its own line, then restate every KPI with its % and Good/Watch/Bad label, then connect each
  major recommendation cluster to which KPI(s) it improves.
- When CMMS Workcenterroles text is provided, repeat it verbatim wherever you name accountable
  parties or roles.
- Do not mention the modelling framework, machine learning, or "the model" to the reader;
  speak in operational language only.
- Length and depth: aim for at least 800-1500 words when context is rich. Every numbered section
  below must be filled with substance—no one-line sections. Use bullets and sub-bullets for
  actions and owners."""

        user_parts = [
            "Use the STRUCTURED_DECISION JSON as the source of truth for the recommended action.",
            f"STRUCTURED_DECISION:\n{json.dumps(nba_block, indent=2)}",
            f"FEATURE_ROW_USED:\n{json.dumps(nba.get('feature_row') or {}, indent=2)}",
            f"ASSET_AND_CONTEXT:\n{json.dumps(asset_data, indent=2)[:24000]}",
        ]
        if context:
            user_parts.append(f"ADDITIONAL_CONTEXT:\n{json.dumps(context, indent=2)[:8000]}")
        if kpi_digest:
            user_parts.append(
                "Executive KPI snapshot (must appear in your opening when present):\n"
                f"{kpi_digest}\n"
            )
        if cmms:
            user_parts.append(
                f"CMMS Workcenterroles (copy verbatim when naming accountable parties):\n{cmms}\n"
            )

        user_parts.append(
            "Produce a comprehensive, synthesized guidance document with these sections "
            "(use clear headings exactly as below):\n\n"
            "1. Executive Summary — 3-5 sentences: urgency, link to primary next-best action, "
            "and how fleet/KPI context supports it.\n"
            "2. Immediate Actions Required — at least 5-7 specific bullet points: what, who, "
            "by when; the first bullets must implement primary_title and its playbook.\n"
            "3. Detailed Analysis — multiple short paragraphs: interpret anomalies, "
            "root-cause hints, and KPIs; explain why this action matters now.\n"
            "4. Preventive Measures — 4+ bullets for longer-term hardening "
            "(PM, spares, training, monitoring).\n"
            "5. Risk Assessment — probability/impact style language; production "
            "and safety angles.\n"
            "6. Expected Outcomes — quantified or concrete benefits and timeline to see them.\n"
            "7. Next Steps — numbered owners and deadlines; "
            "echo CMMS Workcenterroles where roles are named.\n\n"
            "If recommendationContext (anomalies, past events) is present in ASSET_AND_CONTEXT, "
            "reference it explicitly in section 3.\n"
            "If kpiDigestForAi is present, the opening must follow the "
            "KPI rules in the system message.\n"
            "Use markdown-style **bold** for sub-headings within sections if it "
            "improves scanability."
        )
        prompt = "\n\n".join(user_parts)

        if not self.client:
            text = self._recommendation_template_no_llm(asset_data, nba, kpi_digest, cmms)
            return text, nba_public

        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.65,
                **_completion_budget_kwargs(3500),
            )
            text = response.choices[0].message.content
            if text:
                return text, nba_public
            text = self._recommendation_template_no_llm(asset_data, nba, kpi_digest, cmms)
            return text, nba_public
        except Exception as e:
            logger.warning("Recommendation LLM failed: %s", e)
            text = self._recommendation_template_no_llm(asset_data, nba, kpi_digest, cmms)
            return text, nba_public

    def _recommendation_template_no_llm(
        self,
        asset_data: dict[str, Any],
        nba: dict[str, Any],
        kpi_digest: str,
        cmms: str,
    ) -> str:
        aid = nba.get("action_id")
        title = nba.get("title") or "Next best action"
        pb = nba.get("playbook") or ""
        probs = nba.get("top_probabilities") or []
        rc = asset_data.get("recommendationContext")
        rc_txt = json.dumps(rc, indent=2)[:6000] if isinstance(rc, dict) else ""

        lines: list[str] = []
        if kpi_digest:
            lines.append("Based on these KPIs:")
            lines.append(kpi_digest)
            lines.append("")

        lines.append("## 1. Executive Summary")
        lines.append(
            f"The reliability engine recommends **{title}** as the primary next step for asset "
            f"{asset_data.get('asset_id', 'N/A')} "
            f"({asset_data.get('status', '')} / {asset_data.get('criticality', '')} at "
            f"{asset_data.get('plant', '')}, {asset_data.get('state', '')}). "
            f"This aligns with the interpreted operating risk for the current period."
        )
        lines.append("")

        lines.append("## 2. Immediate Actions Required")
        lines.append(f"- Execute: **{title}** (action id {aid}).")
        if pb:
            lines.append(f"- Playbook: {pb}")
        lines.append("- Confirm resources and line clearance with production leadership.")
        lines.append(
            "- Brief the accountable workcenter (see CMMS line below) on scope and timing."
        )
        lines.append("- Document baseline readings and any permits/LOTO before work begins.")
        lines.append("")

        lines.append("## 3. Detailed Analysis")
        lines.append(
            "Feature snapshot used for scoring includes RUL and KPI-derived signals; "
            f"primary choice remained **{title}**. "
            "Review vibration/thermal trends and recent events in recommendationContext "
            "if listed below."
        )
        if rc_txt:
            lines.append("")
            lines.append("**Condition / context bundle:**")
            lines.append(rc_txt)
        lines.append("")

        lines.append("## 4. Preventive Measures")
        lines.append("- Sustain PM cadence and lubrication routes tied to this asset class.")
        lines.append("- Keep critical spares staged for known failure modes on this line.")
        lines.append("- Extend monitoring if KPI bands stay in Watch/Bad after remediation.")
        lines.append("")

        lines.append("## 5. Risk Assessment")
        lines.append(
            f"Severity scales with criticality ({asset_data.get('criticality', 'n/a')}) "
            f"and current status ({asset_data.get('status', 'n/a')}). "
            "Deferring the primary action increases exposure to unplanned downtime and "
            "quality excursions."
        )
        lines.append("")

        lines.append("## 6. Expected Outcomes")
        lines.append(
            f"- Completing **{title}** should reduce immediate failure risk and "
            "stabilize KPIs referenced above."
        )
        lines.append(
            "- Follow-up validation within one maintenance cycle to confirm sustained performance."
        )
        lines.append("")

        lines.append("## 7. Next Steps")
        if cmms:
            lines.append(
                f"- Owners / CMMS Workcenterroles (copy verbatim for accountability): {cmms}"
            )
        else:
            lines.append("- Assign owners via your CMMS row for this asset.")
        lines.append("- Set a due date and tie to planned downtime where applicable.")
        lines.append("")

        lines.append("**Structured decision (engine)**")
        lines.append(f"- Primary action: {title} (id {aid})")
        if probs:
            lines.append("- Top alternatives:")
            for p in probs[:5]:
                lines.append(f"  - {p.get('title')} ({float(p.get('probability', 0)) * 100:.1f}%)")
        if not nba.get("model_ok"):
            lines.append(f"- Note: {nba.get('reason', 'fallback rules used')}")

        lines.append("")
        lines.append(
            "*Azure OpenAI is not configured or the narrative call failed; this expanded "
            "template summarizes the model decision. Configure AZURE_ENDPOINT and "
            "AZURE_API_KEY in backend .env for full LLM-synthesized prose.*"
        )
        return "\n".join(lines)

    def generate_analysis(
        self,
        asset_id: str,
        asset_data: dict[str, Any],
        historical_data: dict[str, Any] | None = None,
    ) -> str:
        """Generate AI-powered analysis for a specific asset"""

        prompt = (
            f"You are an expert maintenance analyst for PepsiCo. "
            f"Provide a detailed root cause analysis for the following asset.\n\n"
            f"Asset ID: {asset_id}\n"
            f"Asset Data:\n"
            f"{json.dumps(asset_data, indent=2)}\n\n"
        )
        if historical_data:
            prompt += f"""Historical Data: {json.dumps(historical_data, indent=2)}"""

        prompt += (
            "Provide a comprehensive analysis including:\n"
            "1. Root cause identification\n"
            "2. Contributing factors\n"
            "3. Impact assessment\n"
            "4. Likelihood of failure\n"
            "5. Recommended investigation steps\n"
            "Format your response as a professional analysis report."
        )

        if not self.client:
            return (
                "Azure OpenAI is not configured. Please set up your "
                "API credentials in the .env file."
            )

        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert maintenance and root cause "
                            "analysis specialist for PepsiCo."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                **_completion_budget_kwargs(800),
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Unable to generate AI analysis: {str(e)}"

    def generate_work_order_narrative(
        self,
        work_order: dict[str, Any],
        asset_context: dict[str, Any] | None = None,
        recent_anomalies: list[dict[str, Any]] | None = None,
    ) -> str | None:
        """
        Short operational summary for a maintenance work-order email
        (what it means, context, next steps).
        Returns None if Azure OpenAI is not configured or the call fails
        (caller sends template-only mail).
        """
        if not self.client:
            return None

        payload = {
            "scheduled_work_order": work_order,
            "asset_record": asset_context,
            "recent_condition_rows_sample": (recent_anomalies or [])[:8],
        }
        prompt = (
            "You are writing the body section of an internal maintenance notification email "
            "for PepsiCo operations.\n\n"
            "Use ONLY the JSON facts below. Do not invent asset IDs, dates, or sensor values "
            "not present in the data.\n"
            "If anomaly or asset details are missing or empty, say what is unknown briefly "
            "and still give useful generic guidance for this type of maintenance.\n\n"
            "JSON context:\n"
            f"{json.dumps(payload, indent=2)}\n\n"
            "Write a clear email-ready section with these headings "
            "(use plain text, no markdown):\n"
            "1) What this is — one short paragraph on what this scheduled work "
            "order is and why it matters.\n"
            "2) What we know — bullet lines from the work order and asset/anomaly "
            "data (paraphrase; do not dump raw JSON).\n"
            "3) Recommended actions — 2–4 concrete next steps for the recipient.\n\n"
            "Keep total length under 280 words. Professional, direct tone."
        )

        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a maintenance operations writer for PepsiCo. "
                            "Be accurate and concise."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                **_completion_budget_kwargs(700),
            )
            text = (response.choices[0].message.content or "").strip()
            return text or None
        except Exception as e:
            logger.warning("Work order narrative LLM failed: %s", e)
            return None

    def assistant_chat(
        self,
        messages: list[dict[str, str]],
        route: str,
        page_title: str | None,
        knowledge_base: str,
        ui_context: dict[str, Any] | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """
        General chat assistant grounded in the provided knowledge_base and optional UI snapshot.
        """
        if not self.client:
            return (
                "Azure OpenAI is not configured. Set AZURE_ENDPOINT and AZURE_API_KEY in "
                "the backend .env file."
            )

        cap = max_tokens if max_tokens is not None else settings.azure_assistant_max_tokens
        meta_parts = [f"Current app route: {route}"]
        if page_title:
            meta_parts.append(f"Page title: {page_title}")
        if ui_context:
            meta_parts.append(
                "UI context (filters, selections):\n" + json.dumps(ui_context, indent=2)[:12000]
            )
        meta_block = "\n".join(meta_parts)

        system = (
            "You are a PepsiCo operations and reliability assistant helping with a "
            "maintenance and asset-health demo.\n\n"
            "SESSION META (internal only — do not quote route names or meta labels to the "
            "user): route and filters tell you which step they are on and whether "
            "operatorRole is processing (fryer, thermal oil, seasoning train) or packaging "
            "(palletizer, case line, conveyors). Use that vocabulary naturally "
            "in answers.\n\n"
            "Internal grounding (never mention these mechanics to the user):\n"
            "- Use the facts in the KNOWLEDGE BASE block below to stay aligned with the same "
            "numbers, assets, and events as the demo session. Prefer the block titled with "
            "'Current screen data' when it conflicts with the shorter server grounding "
            "section. For processing lens, ignore server rows that imply a different story "
            "than that block.\n"
            "- Do not tell the user that information comes from 'the UI', 'the screen', "
            "'the dashboard', 'what you see', 'the app shows', 'live data', 'JSON', "
            "'knowledge base', 'snapshot', or similar. Answer in plain operational language "
            "as if you already know the plant situation.\n\n"
            "Response style:\n"
            "- Write in plain text only. Do not use Markdown: no asterisks for bold or "
            "italics, no hash headings, no backticks, no bullet asterisks (use simple lines "
            "starting with a dash or numbered lines like 1. 2. if you need lists).\n"
            "- Be direct, professional, and readable: short paragraphs and simple "
            "lists are fine.\n"
            "- Do not paste raw JSON unless the user explicitly asks for raw data.\n"
            "- If something is not in the provided facts, say briefly that the detail is "
            "not available for this session or view — do not instruct them to 'look at the "
            "screen' or 'check the UI'.\n\n"
            "--- KNOWLEDGE BASE ---\n"
            f"{knowledge_base[:120000]}\n\n"
            "--- SESSION META ---\n"
            f"{meta_block}\n"
        )

        api_messages: list[dict[str, str]] = [{"role": "system", "content": system}]
        for m in messages:
            role = m.get("role", "user")
            if role not in ("user", "assistant"):
                continue
            content = (m.get("content") or "").strip()
            if not content:
                continue
            api_messages.append({"role": role, "content": content[:32000]})

        if len(api_messages) <= 1:
            return "Send a message to continue."

        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=api_messages,
                temperature=0.45,
                **_completion_budget_kwargs(min(cap, 8192)),
            )
            raw = (response.choices[0].message.content or "").strip()
            return _assistant_reply_plain_text(raw) or "(No response)"
        except Exception as e:
            logger.warning("Assistant chat failed: %s", e)
            return f"Unable to reach the assistant: {e}"
