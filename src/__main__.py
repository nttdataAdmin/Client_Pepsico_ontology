"""Main entry point for the mfgpro_mockup project.

This script serves as the starting point for the application. It imports
necessary modules and executes the main function.
"""

from src.my_module import greet


def main() -> None:
    """Print a greeting message to the console."""
    greeting = greet(name="user")
    print(greeting)


if __name__ == "__main__":
    main()
