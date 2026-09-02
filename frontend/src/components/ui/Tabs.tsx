import React from 'react';

type Tab = {
  id: string;
  label: string;
  disabled?: boolean;
};

type TabsProps = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
};

export const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange }) => (
  <div className="ui-tabs" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={tab.id === active}
        aria-disabled={tab.disabled || undefined}
        disabled={tab.disabled}
        className={`ui-tabs__tab ${tab.id === active ? 'ui-tabs__tab--active' : ''} ${tab.disabled ? 'ui-tabs__tab--disabled' : ''}`.trim()}
        onClick={() => !tab.disabled && onChange(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export const TabPanel: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => {
  if (!active) return null;
  return (
    <div className="ui-tab-panel" role="tabpanel">
      {children}
    </div>
  );
};
