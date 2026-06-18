import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getChatKnowledgeForRoute } from '../config/chatRouteKnowledge';

const ChatAssistantContext = createContext(null);

export function ChatAssistantProvider({ children, routePath = '/login' }) {
  const [routePathState, setRoutePathState] = useState(routePath);
  const [pageTitle, setPageTitle] = useState('');
  const [dynamicKnowledge, setDynamicKnowledge] = useState('');
  const [uiContext, setUiContext] = useState(null);

  const setRoutePath = useCallback((path) => {
    setRoutePathState(path || '/');
  }, []);

  const mergedKnowledgeBase = useMemo(() => {
    const base = getChatKnowledgeForRoute(routePathState);
    if (!dynamicKnowledge || !String(dynamicKnowledge).trim()) return base;
    return `${base}\n\n--- Current screen data (live — matches UI, filters, and operatorRole) ---\n${String(dynamicKnowledge).trim()}`;
  }, [routePathState, dynamicKnowledge]);

  const value = useMemo(
    () => ({
      routePath: routePathState,
      setRoutePath,
      pageTitle,
      setPageTitle,
      dynamicKnowledge,
      setDynamicKnowledge,
      uiContext,
      setUiContext,
      mergedKnowledgeBase,
    }),
    [routePathState, setRoutePath, pageTitle, dynamicKnowledge, mergedKnowledgeBase, uiContext]
  );

  return <ChatAssistantContext.Provider value={value}>{children}</ChatAssistantContext.Provider>;
}

export function useChatAssistant() {
  const ctx = useContext(ChatAssistantContext);
  if (!ctx) {
    throw new Error('useChatAssistant must be used within ChatAssistantProvider');
  }
  return ctx;
}

/**
 * Register extra context for the current page (cleared on unmount).
 * Pass a memoized string when content is derived from props/state.
 */
export function usePageChatKnowledge(knowledge) {
  const { setDynamicKnowledge } = useChatAssistant();
  React.useEffect(() => {
    if (knowledge == null || knowledge === '') {
      setDynamicKnowledge('');
    } else {
      setDynamicKnowledge(String(knowledge));
    }
    return () => setDynamicKnowledge('');
  }, [knowledge, setDynamicKnowledge]);
}
