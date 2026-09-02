import React from 'react';

type TableProps = {
  headers: string[];
  children: React.ReactNode;
  ariaLabel: string;
};

export const Table: React.FC<TableProps> = ({ headers, children, ariaLabel }) => {
  return (
    <table className="table" aria-label={ariaLabel}>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
};
