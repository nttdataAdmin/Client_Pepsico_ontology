"""This module contains a function that generates a greeting message for the user."""


def greet(name: str) -> str:
    """Return a greeting message for the user.

    Args:
        name: The name of the user to greet.

    Returns:
        A greeting message that includes the user's name.
    """
    return f"Hello, {name}! 👋"
