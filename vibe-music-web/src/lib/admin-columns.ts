export type AdminColumn = {
  id: string;
  label: string;
  visible: boolean;
  fixed?: boolean;
};

export function moveAdminColumn(
  columns: AdminColumn[],
  source: string,
  target: string,
) {
  const from = columns.findIndex((column) => column.id === source);
  const to = columns.findIndex((column) => column.id === target);
  if (
    from < 0 ||
    to < 0 ||
    from === to ||
    columns[from].fixed ||
    columns[to].fixed
  )
    return columns;
  const next = [...columns];
  const [column] = next.splice(from, 1);
  next.splice(to, 0, column);
  return next;
}
