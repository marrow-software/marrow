"""Fractional indexing for sibling ordering.

Python port of https://www.npmjs.com/package/fractional-indexing.

A fractional index is a short string that is lexicographically between two
other strings. Inserts and reorders only assign one new position; no other
rows need updating.

Format: an optional run of 'A' (negative) or 'a'..'z' (non-negative) "head"
characters that encode the integer-part length, followed by base-62 "fraction"
digits that pin down the value between neighbors. Trailing '0's are forbidden
in the fraction.
"""

BASE_62_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
SMALLEST_INTEGER = "A00000000000000000000000000"
INTEGER_ZERO = "a0"


def _midpoint(a: str, b: str | None) -> str:
    """Return a string strictly between a and b in the base-62 fractional alphabet."""
    if b is not None and a >= b:
        raise ValueError(f"{a} >= {b}")
    if (a and a[-1] == "0") or (b is not None and b.endswith("0")):
        raise ValueError("trailing zero")
    if b is not None:
        # longest common prefix; treat missing chars of `a` as "0"
        n = 0
        while n < len(b):
            ac = a[n] if n < len(a) else "0"
            if ac != b[n]:
                break
            n += 1
        if n > 0:
            return b[:n] + _midpoint(a[n:], b[n:])
    digit_a = BASE_62_DIGITS.index(a[0]) if a else 0
    digit_b = BASE_62_DIGITS.index(b[0]) if b is not None else len(BASE_62_DIGITS)
    if digit_b - digit_a > 1:
        mid_digit = round(0.5 * (digit_a + digit_b))
        return BASE_62_DIGITS[mid_digit]
    if b is not None and len(b) > 1:
        return b[:1]
    return BASE_62_DIGITS[digit_a] + _midpoint(a[1:], None)


def _validate_integer_part(int_part: str) -> None:
    exp = _integer_length(int_part[0])
    if len(int_part) != exp:
        raise ValueError(f"invalid integer part {int_part}: length {len(int_part)} != {exp}")


def _integer_length(head: str) -> int:
    if "a" <= head <= "z":
        return ord(head) - ord("a") + 2
    if "A" <= head <= "Z":
        return ord("Z") - ord(head) + 2
    raise ValueError(f"invalid head: {head}")


def _get_integer_part(key: str) -> str:
    n = _integer_length(key[0])
    if n > len(key):
        raise ValueError(f"invalid key: {key}")
    return key[:n]


def _validate_order_key(key: str) -> None:
    if key == SMALLEST_INTEGER:
        raise ValueError(f"invalid order key: {key}")
    i = _get_integer_part(key)
    f = key[len(i):]
    if f.endswith("0"):
        raise ValueError(f"invalid order key (trailing zero): {key}")


def _increment_integer(x: str) -> str | None:
    _validate_integer_part(x)
    head, digs = x[0], list(x[1:])
    carry = True
    i = len(digs) - 1
    while carry and i >= 0:
        d = BASE_62_DIGITS.index(digs[i]) + 1
        if d == len(BASE_62_DIGITS):
            digs[i] = "0"
        else:
            digs[i] = BASE_62_DIGITS[d]
            carry = False
        i -= 1
    if carry:
        if head == "Z":
            return "a0"
        if head == "z":
            return None
        h = chr(ord(head) + 1)
        if h > "a":
            digs.append("0")
        else:
            digs.pop(0)
        return h + "".join(digs)
    return head + "".join(digs)


def _decrement_integer(x: str) -> str | None:
    _validate_integer_part(x)
    head, digs = x[0], list(x[1:])
    borrow = True
    i = len(digs) - 1
    while borrow and i >= 0:
        d = BASE_62_DIGITS.index(digs[i]) - 1
        if d == -1:
            digs[i] = BASE_62_DIGITS[-1]
        else:
            digs[i] = BASE_62_DIGITS[d]
            borrow = False
        i -= 1
    if borrow:
        if head == "a":
            return "Z" + BASE_62_DIGITS[-1]
        if head == "A":
            return None
        h = chr(ord(head) - 1)
        if h < "Z":
            digs.append(BASE_62_DIGITS[-1])
        else:
            digs.pop(0)
        return h + "".join(digs)
    return head + "".join(digs)


def key_between(a: str | None, b: str | None) -> str:
    """Return a key strictly between a and b. None for either bound means open-ended."""
    if a is not None:
        _validate_order_key(a)
    if b is not None:
        _validate_order_key(b)
    if a is not None and b is not None and a >= b:
        raise ValueError(f"{a} >= {b}")
    if a is None:
        if b is None:
            return INTEGER_ZERO
        ib = _get_integer_part(b)
        fb = b[len(ib):]
        if ib == SMALLEST_INTEGER:
            return ib + _midpoint("", fb)
        if ib < b:
            return ib
        res = _decrement_integer(ib)
        if res is None:
            raise ValueError("cannot decrement")
        return res
    if b is None:
        ia = _get_integer_part(a)
        fa = a[len(ia):]
        i = _increment_integer(ia)
        if i is None:
            return ia + _midpoint(fa, None)
        return i
    ia = _get_integer_part(a)
    fa = a[len(ia):]
    ib = _get_integer_part(b)
    fb = b[len(ib):]
    if ia == ib:
        return ia + _midpoint(fa, fb)
    i = _increment_integer(ia)
    if i is None:
        raise ValueError("cannot increment")
    if i < b:
        return i
    return ia + _midpoint(fa, None)


def between(a: str | None, b: str | None) -> str:
    """Return a position lex-between a and b. Either may be None for open-ended."""
    return key_between(a, b)


def after(a: str | None) -> str:
    """Return a position lex-greater than a, or the initial position if a is None."""
    return key_between(a, None)


def before(b: str | None) -> str:
    """Return a position lex-less than b, or the initial position if b is None."""
    return key_between(None, b)
