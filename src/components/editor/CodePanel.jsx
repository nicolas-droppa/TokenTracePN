import React, { memo, useRef } from 'react';

/**
 * CodePanel
 * 
 * Props:
 *   code         — string source
 *   onCodeChange — (string) => void
 *   errors       — Array<{ line: number, msg: string }>
 */
const CodePanel = memo(({ code, onCodeChange, errors = [] }) => {
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const handleScroll = (e) => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.target.scrollTop;
  };

  const lines = code.split('\n');
  const errorLines = new Set(errors.map(e => e.line));

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 overflow-hidden text-sm">
      {/* Header */}
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-800/50 shrink-0 flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Editor / petri-lang
        </span>
        {errors.length > 0 && (
          <span className="text-[10px] text-red-500 font-bold animate-pulse">
            {errors.length} ERROR{errors.length > 1 ? 'S' : ''}
          </span>
        )}
      </div>

      <div className="relative flex flex-1 overflow-hidden font-mono leading-6">
        {/* Error + comment highlight layer */}
        <div
          className="absolute left-0 top-0 w-full pointer-events-none pt-4 z-0"
          style={{ transform: `translateY(-${textareaRef.current?.scrollTop || 0}px)` }}
        >
          {lines.map((line, i) => {
            const hasError = errorLines.has(i + 1);
            const isComment = line.trim().startsWith('//');
            return (
              <div key={i} className="h-6 w-full flex">
                <div className="w-12 shrink-0" />
                <div className={`flex-1 ${
                  hasError   ? 'bg-red-500/15 border-l-2 border-red-500' :
                  isComment  ? 'bg-slate-800/40 opacity-50' : ''
                }`} />
              </div>
            );
          })}
        </div>

        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          className="w-12 bg-slate-950 text-slate-600 text-right pr-3 select-none overflow-hidden pt-4 border-r border-slate-800 z-10"
        >
          {lines.map((line, i) => (
            <div key={i} className={`h-6 ${
              errorLines.has(i + 1) ? 'text-red-500 font-bold' :
              line.trim().startsWith('//') ? 'text-slate-800' : ''
            }`}>
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          spellCheck={false}
          onScroll={handleScroll}
          className="flex-1 bg-transparent p-4 pt-4 text-emerald-400 outline-none resize-none overflow-auto whitespace-pre z-20 relative caret-white selection:bg-blue-500/30"
          style={{ lineHeight: '1.5rem' }}
          value={code}
          onChange={e => onCodeChange(e.target.value)}
        />
      </div>
    </div>
  );
});

CodePanel.displayName = 'CodePanel';
export default CodePanel;
