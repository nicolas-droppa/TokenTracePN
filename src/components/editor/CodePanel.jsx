import React, { memo } from 'react';

const CodePanel = memo(({ code, onCodeChange }) => {
  console.log("Rendering CodePanel..."); // Ak toto uvidíš v konzole pri pannovaní, niečo je zle
  return (
    <div className="flex flex-col h-full w-full bg-slate-900">
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-800/50">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Editor / petri-lang
        </span>
      </div>
      <textarea
        spellCheck="false"
        className="flex-1 w-full bg-transparent p-4 font-mono text-sm text-emerald-400 outline-none resize-none"
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        placeholder="// Začni písať place p1; ..."
      />
    </div>
  );
});

// Pridáme meno pre lepší debug v React DevTools
CodePanel.displayName = 'CodePanel';

export default CodePanel;