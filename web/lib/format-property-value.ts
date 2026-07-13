import type { PropertyValueType } from "@/lib/types";

export function formatPropertyValue(
  value: string | null,
  valueType: PropertyValueType,
): string | null {
  if (value === null || value === "") {
    if (valueType === "checkbox") return null;
    return null;
  }

  switch (valueType) {
    case "text":
    case "number":
    case "date":
    case "select":
      return value;
    case "multi-select": {
      try {
        const labels = JSON.parse(value) as string[];
        if (!Array.isArray(labels) || labels.length === 0) return null;
        return labels.join(", ");
      } catch {
        return value;
      }
    }
    case "checkbox":
      return value === "true" ? "Yes" : null;
    default: {
      const _exhaustive: never = valueType;
      return _exhaustive;
    }
  }
}
