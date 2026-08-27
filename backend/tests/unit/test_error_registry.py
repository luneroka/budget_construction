"""Every error message the application raises must map to an error code.

``app/errors.py`` turns a plain-string ``HTTPException.detail`` (or a domain
``ValueError`` message that a router forwards as one) into the ``{code,
message}`` envelope by looking the *exact* message up in
``ERROR_DEFINITIONS``. A message that is not registered silently degrades to
the status-code default (``bad_request``, ``not_found``...) and the SPA shows
a generic sentence instead of the specific French copy.

This test walks the source tree with ``ast`` so that forgetting to register a
new message is a red test rather than a support ticket.
"""

from __future__ import annotations

import ast
from pathlib import Path

from app.errors import ERROR_DEFINITIONS, MESSAGE_TO_CODE
from app.routers.integrity import CONSTRAINT_MESSAGES

APP_DIR = Path(__file__).resolve().parents[2] / 'app'

# Exceptions whose first positional argument becomes a client-visible message.
MESSAGE_CARRYING_ERRORS = frozenset(
    {
        'BudgetLineValidationError',
        'DocumentUploadValidationError',
        'ProjectValidationError',
        'TemplateItemValidationError',
        'TransactionValidationError',
        'TrashRestoreError',
        'UserLifecycleError',
    }
)
# Functions whose named positional argument is an error *code*.
CODE_CARRYING_CALLS = {'raise_api_error': 1, 'error_detail': 0}


def _callee_name(node: ast.Call) -> str | None:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return None


def _iter_calls() -> list[tuple[str, ast.Call]]:
    calls: list[tuple[str, ast.Call]] = []
    for path in sorted(APP_DIR.rglob('*.py')):
        tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                calls.append((f'{path.relative_to(APP_DIR)}:{node.lineno}', node))
    return calls


def _message_expressions() -> list[tuple[str, ast.expr]]:
    expressions: list[tuple[str, ast.expr]] = []
    for location, call in _iter_calls():
        name = _callee_name(call)
        if name == 'HTTPException':
            expressions.extend(
                (location, keyword.value)
                for keyword in call.keywords
                if keyword.arg == 'detail'
            )
        elif name in MESSAGE_CARRYING_ERRORS and call.args:
            expressions.append((location, call.args[0]))
    return expressions


def _code_expressions() -> list[tuple[str, ast.expr]]:
    expressions: list[tuple[str, ast.expr]] = []
    for location, call in _iter_calls():
        position = CODE_CARRYING_CALLS.get(_callee_name(call) or '')
        if position is not None and len(call.args) > position:
            expressions.append((location, call.args[position]))
    return expressions


def test_every_raised_message_maps_to_an_error_code() -> None:
    unregistered: list[str] = []
    dynamic: list[str] = []

    for location, expression in _message_expressions():
        if isinstance(expression, ast.Constant) and isinstance(expression.value, str):
            if expression.value not in MESSAGE_TO_CODE:
                unregistered.append(f'{location}: {expression.value!r}')
        elif isinstance(expression, ast.JoinedStr):
            # An f-string can never match a registered message.
            dynamic.append(location)
        # Anything else (str(error), a variable) forwards a message that is
        # itself checked at its own raise site.

    assert not dynamic, 'Dynamic (f-string) error messages: ' + ', '.join(dynamic)
    assert not unregistered, 'Messages missing from ERROR_DEFINITIONS:\n' + '\n'.join(
        unregistered
    )


def test_every_referenced_error_code_is_defined() -> None:
    unknown = [
        f'{location}: {expression.value!r}'
        for location, expression in _code_expressions()
        if isinstance(expression, ast.Constant)
        and isinstance(expression.value, str)
        and expression.value not in ERROR_DEFINITIONS
    ]

    assert not unknown, 'Codes missing from ERROR_DEFINITIONS:\n' + '\n'.join(unknown)


def test_integrity_constraint_messages_map_to_error_codes() -> None:
    unregistered = [
        message for message in CONSTRAINT_MESSAGES.values() if message not in MESSAGE_TO_CODE
    ]

    assert unregistered == []
