"""Tests for fractional_index helpers."""

import pytest

from marrow.fractional_index import after, before, between, key_between


def test_empty_list_initial_position():
    pos = after(None)
    assert pos == "a0"


def test_after_returns_greater_string():
    a = "a0"
    b = after(a)
    assert b > a


def test_before_returns_smaller_string():
    a = "a0"
    b = before(a)
    assert b < a


def test_between_strictly_in_order():
    a = after(None)        # a0
    b = after(a)           # > a0
    mid = between(a, b)
    assert a < mid < b


def test_between_open_left():
    b = "a0"
    pos = between(None, b)
    assert pos < b


def test_between_open_right():
    a = "a0"
    pos = between(a, None)
    assert pos > a


def test_between_dense_neighbors():
    a = "a0"
    b = after(a)
    # Insert many values between a and b; each must remain strictly between.
    lo, hi = a, b
    for _ in range(20):
        mid = between(lo, hi)
        assert lo < mid < hi
        # alternate which side we narrow to force deep recursion
        hi = mid


def test_very_deep_insertions_remain_ordered():
    a = "a0"
    b = after(a)
    values = [a, b]
    for _ in range(50):
        mid = between(values[0], values[1])
        assert values[0] < mid < values[1]
        values.insert(1, mid)
    # Final list must be strictly increasing.
    for left, right in zip(values, values[1:]):
        assert left < right


def test_between_rejects_inverted_inputs():
    with pytest.raises(ValueError):
        between("a1", "a0")


def test_between_rejects_equal_inputs():
    with pytest.raises(ValueError):
        between("a0", "a0")


def test_sequential_after_strictly_increasing():
    pos = None
    seq = []
    for _ in range(30):
        pos = after(pos)
        seq.append(pos)
    for left, right in zip(seq, seq[1:]):
        assert left < right


def test_key_between_matches_between():
    assert key_between(None, None) == between(None, None) == "a0"
