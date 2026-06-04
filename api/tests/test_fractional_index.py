"""Unit tests for the fractional_index helper."""

import pytest

from marrow.fractional_index import INTEGER_ZERO, SMALLEST_INTEGER, after, between


class TestBetween:
    def test_empty_list(self):
        assert between(None, None) == INTEGER_ZERO

    def test_first_key(self):
        key = between(None, None)
        assert key == "a0"

    def test_after_zero(self):
        key = between("a0", None)
        assert key == "a1"

    def test_sequential_after(self):
        keys = []
        prev = None
        for _ in range(5):
            k = between(prev, None)
            keys.append(k)
            prev = k
        assert keys == sorted(keys), "keys must be in lexicographic order"

    def test_between_adjacent_integers(self):
        mid = between("a0", "a2")
        assert "a0" < mid < "a2"

    def test_between_consecutive_integers_uses_fraction(self):
        mid = between("a0", "a1")
        assert "a0" < mid < "a1"

    def test_between_no_lower_bound(self):
        key = between(None, "a0")
        assert key < "a0"

    def test_between_no_upper_bound(self):
        key = between("a5", None)
        assert key > "a5"

    def test_dense_neighbors(self):
        # Generate many keys between a0 and a1; they must all remain sorted.
        lo, hi = "a0", "a1"
        keys = []
        for _ in range(20):
            mid = between(lo, hi)
            assert lo < mid < hi, f"expected {lo!r} < {mid!r} < {hi!r}"
            keys.append(mid)
            lo = mid  # keep inserting at the new lower end

    def test_very_deep_insertions(self):
        lo, hi = "a0", "a1"
        prev_mid = None
        for depth in range(50):
            mid = between(lo, hi)
            assert lo < mid < hi, f"depth {depth}: {lo!r} < {mid!r} < {hi!r}"
            if prev_mid is not None:
                assert mid != prev_mid
            prev_mid = mid
            hi = mid  # keep inserting at the new upper end

    def test_overflow_past_az_gives_b00(self):
        assert between("az", None) == "b00"

    def test_increment_crosses_digit_boundary(self):
        key = between("a9", None)
        assert key > "a9"

    def test_raises_when_a_gte_b(self):
        with pytest.raises(ValueError):
            between("a2", "a1")

    def test_raises_at_smallest_integer_no_lower(self):
        with pytest.raises(ValueError):
            between(None, SMALLEST_INTEGER)

    def test_single_item_list(self):
        only = between(None, None)
        before = between(None, only)
        after_key = between(only, None)
        assert before < only < after_key


class TestAfter:
    def test_after_none_is_zero(self):
        assert after() == INTEGER_ZERO

    def test_after_zero(self):
        assert after("a0") == "a1"

    def test_after_is_greater(self):
        key = "a5"
        assert after(key) > key

    def test_after_chain(self):
        keys = []
        k = None
        for _ in range(10):
            k = after(k)
            keys.append(k)
        assert keys == sorted(keys)
