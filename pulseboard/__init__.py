"""PulseBoard Studio package."""

from .engine import MODEL_VERSION, ProjectInputError, analyse_project, analyse_slate

__version__ = "2.1.0"

__all__ = [
    "MODEL_VERSION",
    "ProjectInputError",
    "analyse_project",
    "analyse_slate",
    "__version__",
]
