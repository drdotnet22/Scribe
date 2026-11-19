import { useState } from "react";
import { GripVertical } from "lucide-react";

/** A place in a list of rows: row `i` of group `g`. As a drop target, the row is inserted before `i`. */
export interface Spot<G> { g: G; i: number }

/**
 * Moves an item from one list to another (or within one list).
 * `to` is the index it is inserted before, counted before the move.
 */
export function moveItem<T>(from: T[], to: T[], fromIndex: number, toIndex: number) {
  const [item] = from.splice(fromIndex, 1);
  to.splice(from === to && toIndex > fromIndex ? toIndex - 1 : toIndex, 0, item);
}

const grip: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", padding: 2,
  border: 0, background: "transparent", color: "var(--muted)", cursor: "grab",
};

/** The drag handle column: put this `<th>` first in the header row. */
export const gripHeader = <th style={{ width: 28 }} />;

/**
 * Drag-to-reorder for table rows, with a grip handle that also moves rows with the up and down arrow keys.
 * `move` gets where the row was and where it goes. Unless `crossGroups` is set, rows only move within their own group.
 */
export function useRowDrag<G extends string | number>(move: (from: Spot<G>, to: Spot<G>) => void, crossGroups = false) {
  const [held, setHeld] = useState<Spot<G> | null>(null);
  const [drop, setDrop] = useState<Spot<G> | null>(null);
  const end = () => { setHeld(null); setDrop(null); };

  /** Spread onto each `<tr>`. `count` is the number of rows in the group. */
  const rowProps = (g: G, i: number, count: number) => {
    let line: React.CSSProperties = {};
    if (drop?.g === g && drop.i === i) line = { boxShadow: "inset 0 2px 0 var(--accent)" };
    else if (drop?.g === g && drop.i === count && i === count - 1) line = { boxShadow: "inset 0 -2px 0 var(--accent)" };
    return {
      style: { ...line, ...(held?.g === g && held.i === i ? { opacity: 0.4 } : {}) },
      onDragOver: (e: React.DragEvent<HTMLTableRowElement>) => {
        if (!held || (!crossGroups && held.g !== g)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const box = e.currentTarget.getBoundingClientRect();
        const at = e.clientY > box.top + box.height / 2 ? i + 1 : i;
        if (drop?.g !== g || drop.i !== at) setDrop({ g, i: at });
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        // Dropping a row just above or below itself leaves it where it is.
        if (held && drop && !(held.g === drop.g && (drop.i === held.i || drop.i === held.i + 1))) move(held, drop);
        end();
      },
    };
  };

  /** The grip cell for a row. `label` names the row for screen readers, such as "row 3, doors". */
  const handle = (g: G, i: number, count: number, label: string) => (
    <td style={{ padding: "5px 0" }}>
      <button type="button" draggable style={grip} title="Drag to reorder, or use the arrow keys"
        aria-label={`Move ${label}. Use the up and down arrow keys.`}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", "");
          const tr = e.currentTarget.closest("tr");
          if (tr) e.dataTransfer.setDragImage(tr, 14, tr.offsetHeight / 2);
          setHeld({ g, i });
        }}
        onDragEnd={end}
        onKeyDown={(e) => {
          const up = e.key === "ArrowUp", down = e.key === "ArrowDown";
          if (!up && !down) return;
          e.preventDefault();
          const tr = e.currentTarget.closest("tr");
          if (up && i > 0) move({ g, i }, { g, i: i - 1 });
          else if (down && i < count - 1) move({ g, i }, { g, i: i + 2 });
          else return;
          // Keep focus on the handle as the row moves.
          requestAnimationFrame(() =>
            ((up ? tr?.previousElementSibling : tr?.nextElementSibling)?.querySelector("button[draggable]") as HTMLElement | null)?.focus());
        }}>
        <GripVertical size={16} aria-hidden />
      </button>
    </td>
  );

  return { rowProps, handle };
}
