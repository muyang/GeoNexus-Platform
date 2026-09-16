"""Shared pytest configuration for the execution plane.

Puts ``src/`` on ``sys.path`` so the suite imports the in-tree package even when
it has not been ``pip install``-ed into the active interpreter. CI installs the
package first, but a bare ``pytest`` in a fresh virtualenv should still work.
"""

from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
