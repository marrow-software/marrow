"""Fractional indexing for sibling node ordering.

Port of the fractional-indexing npm package (rocicorp/fractional-indexing).
Keys are plain strings that compare correctly with Python's default string
comparison, so ORDER BY position produces stable sibling order.
"""

DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
BASE = len(DIGITS)  # 62
INTEGER_ZERO = "a0"
SMALLEST_INTEGER = "A" + "0" * 26


def _integer_length(head: str) -> int:
    if "a" <= head <= "z":
        return ord(head) - ord("a") + 2
    if "A" <= head <= "Z":
        return ord("Z") - ord(head) + 2
    raise ValueError(f"Invalid order key head: {head!r}")


def _get_integer_part(key: str) -> str:
    return key[: _integer_length(key[0])]


def _validate_integer(x: str) -> None:
    if not x or len(x) != _integer_length(x[0]):
        raise ValueError(f"Invalid integer: {x!r}")


def _increment_integer(x: str) -> str | None:
    _validate_integer(x)
    head = x[0]
    digs = list(x[1:])
    carry = True
    for i in range(len(digs) - 1, -1, -1):
        if not carry:
            break
        d = DIGITS.index(digs[i]) + 1
        if d == BASE:
            digs[i] = "0"
        else:
            digs[i] = DIGITS[d]
            carry = False
    if carry:
        if head == "Z":
            return "a0"
        if head == "z":
            return None
        h = chr(ord(head) + 1)
        if h > "a":
            digs.append("0")
        else:
            digs.pop()
        return h + "".join(digs)
    return head + "".join(digs)


def _decrement_integer(x: str) -> str | None:
    _validate_integer(x)
    head = x[0]
    digs = list(x[1:])
    borrow = True
    for i in range(len(digs) - 1, -1, -1):
        if not borrow:
            break
        d = DIGITS.index(digs[i]) - 1
        if d < 0:
            digs[i] = DIGITS[-1]
        else:
            digs[i] = DIGITS[d]
            borrow = False
    if borrow:
        if head == "a":
            return "Z" + DIGITS[-1]
        if head == "A":
            return None
        h = chr(ord(head) - 1)
        if h < "Z":
            digs.append(DIGITS[-1])
        else:
            digs.pop()
        return h + "".join(digs)
    return head + "".join(digs)


def _midpoint(a: str, b: str | None) -> str:
    if b is not None and a >= b:
        raise ValueError(f"{a!r} >= {b!r}")
    if a.endswith("0") or (b is not None and b.endswith("0")):
        raise ValueError("trailing zero")
    if b is not None:
        n = 0
        while (a[n] if n < len(a) else "0") == b[n]:
            n += 1
        if n > 0:
            return b[:n] + _midpoint(a[n:], b[n:])
    digit_a = DIGITS.index(a[0]) if a else 0
    upper = DIGITS.index(b[0]) if b else BASE
    if upper - digit_a > 1:
        mid = round(0.5 * (upper + digit_a))
        return DIGITS[mid]
    if b is not None and len(b) > 1:
        return b[0]
    return DIGITS[digit_a] + _midpoint(a[1:] if a else "", None)


def between(a: str | None, b: str | None) -> str:
    """Return a fractional index key strictly between a and b.

    Either a or b may be None to indicate no lower/upper bound.
    """
    if a is None and b is None:
        return INTEGER_ZERO
    if a is None:
        int_b = _get_integer_part(b)  # type: ignore[arg-type]
        frac_b = b[len(int_b) :]  # type: ignore[index]
        if int_b == SMALLEST_INTEGER:
            return int_b + _midpoint("", frac_b)
        dec = _decrement_integer(int_b)
        if dec is None:
            raise ValueError("cannot decrement below smallest integer")
        return dec
    if b is None:
        int_a = _get_integer_part(a)
        frac_a = a[len(int_a) :]
        inc = _increment_integer(int_a)
        if inc is None:
            return int_a + _midpoint(frac_a, None)
        return inc
    if a >= b:
        raise ValueError(f"{a!r} >= {b!r}")
    int_a = _get_integer_part(a)
    frac_a = a[len(int_a) :]
    int_b = _get_integer_part(b)
    frac_b = b[len(int_b) :]
    if int_a == int_b:
        return int_a + _midpoint(frac_a, frac_b)
    inc = _increment_integer(int_a)
    if inc is None:
        raise ValueError("cannot increment any more")
    if inc < b:
        return inc
    return int_a + _midpoint(frac_a, None)


def after(a: str | None = None) -> str:
    """Return a fractional index key after a (for appending to end of list)."""
    return between(a, None)
