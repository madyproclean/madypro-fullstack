import React from 'react';
import { Bold, Italic, Underline, List } from 'lucide-react';

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, disabled, placeholder }) => {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string) => {
    if (disabled) return;
    document.execCommand(command, false);
    ref.current?.focus();
  };

  const handleInput = () => {
    if (!ref.current) return;
    onChange(ref.current.innerHTML);
  };

  return (
    <div className="rte">
      <div className="rte__toolbar">
        <button type="button" onClick={() => exec('bold')} disabled={disabled} aria-label="Gras">
          <Bold size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => exec('italic')} disabled={disabled} aria-label="Italique">
          <Italic size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => exec('underline')} disabled={disabled} aria-label="Souligné">
          <Underline size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => exec('insertUnorderedList')} disabled={disabled} aria-label="Liste">
          <List size={14} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={ref}
        className="rte__content"
        contentEditable={!disabled}
        onInput={handleInput}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  );
};
