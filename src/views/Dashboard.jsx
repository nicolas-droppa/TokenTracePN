import React, { useState, useCallback, memo, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  useViewport,
  MarkerType,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import CodePanel from '../components/editor/CodePanel';
import {
  parseCode,
  buildMatrices,
  isEnabled,
  fireTransition,
  getEnabledTransitions,
} from '../logic/petri-engine';

// ─── snap helper ──────────────────────────────────────────────────────────────
const snap = (v, step = 20) => Math.round(v / step) * step;

// ─── CustomNode ───────────────────────────────────────────────────────────────
const CustomNode = memo(({ id, data }) => {
  const isPlace = id.startsWith('p');
  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none">
      <span className="z-10 font-bold text-[10px]">
        {isPlace ? (data.tokens > 0 ? data.tokens : '') : id}
      </span>
      {isPlace && (
        <span className="absolute -bottom-5 text-[9px] text-slate-500 font-mono">{id}</span>
      )}
      {/* Invisible handles on all sides so ReactFlow can route edges */}
      {['Top','Bottom','Left','Right'].flatMap(side => [
        <Handle key={`t-${side}`} type="target" position={Position[side]} className="opacity-0" />,
        <Handle key={`s-${side}`} type="source" position={Position[side]} className="opacity-0" />,
      ])}
    </div>
  );
});

const nodeTypes = { default: CustomNode };

// ─── GhostNode (cursor preview) ───────────────────────────────────────────────
const GhostNode = memo(({ activeTool, ghostPos }) => {
  const { x: vx, y: vy, zoom } = useViewport();
  if (!activeTool || activeTool === 'arc' || activeTool.includes('token')) return null;
  const isPlace = activeTool === 'place';
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: 40, height: 40,
      pointerEvents: 'none', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: '10px', fontWeight: 'bold',
      borderRadius: isPlace ? '50%' : '4px',
      border: `2px dashed ${isPlace ? '#3b82f6' : '#10b981'}`,
      backgroundColor: isPlace ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)',
      transform: `translate(${vx + ghostPos.x * zoom}px, ${vy + ghostPos.y * zoom}px) scale(${zoom})`,
      transformOrigin: '0 0',
    }}>
      {isPlace ? 'P' : 'T'}
    </div>
  );
});

// ─── Main dashboard ───────────────────────────────────────────────────────────
const INITIAL_CODE = `place p1(1);\nplace p2(0);\ntransition t1;\np1 -> t1;\nt1 -> p2;`;

const DashboardContent = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [code, setCode] = useState(INITIAL_CODE);
  const [activeTool, setActiveTool] = useState(null);
  const [sourceNode, setSourceNode] = useState(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [errors, setErrors] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Live simulation marking (separate from the "initial" marking in code)
  const [simMarking, setSimMarking] = useState(null);

  // Remember positions across re-parses
  const pendingPositions = useRef({});
  const nodePositions = useRef({});

  const { screenToFlowPosition } = useReactFlow();

  const onNodesChange = useCallback((chs) => {
    setNodes(nds => {
      const updated = applyNodeChanges(chs, nds);
      // Persist dragged positions
      for (const ch of chs) {
        if (ch.type === 'position' && ch.position) {
          nodePositions.current[ch.id] = ch.position;
        }
      }
      return updated;
    });
  }, []);

  const onEdgesChange = useCallback((chs) => setEdges(eds => applyEdgeChanges(chs, eds)), []);
  const handleCodeChange = useCallback((v) => setCode(v), []);

  // ── Parse code + build graph whenever code or sim state changes ──────────
  useEffect(() => {
    const { places, transitions, arcs, marking: initialMarking, errors: parseErrors } = parseCode(code);

    // Build matrices
    const { pre, post } = buildMatrices(places, transitions, arcs);

    // Active marking: use simMarking if simulating (and it's still valid), else initialMarking
    const activeMark = (isSimulating && simMarking) ? simMarking : initialMarking;

    // If simulation just started, seed simMarking from parsed initial marking
    if (isSimulating && !simMarking) {
      setSimMarking(initialMarking);
    }

    // Build edges
    const newEdges = arcs.map(({ src, tgt }, i) => ({
      id: `e-${src}-${tgt}-${i}`,
      source: src,
      target: tgt,
      type: 'straight',
      animated: isSimulating,
      markerEnd: { type: MarkerType.ArrowClosed, color: isSimulating ? '#3b82f6' : '#94a3b8' },
      style: { stroke: isSimulating ? '#3b82f6' : '#475569', strokeWidth: 2 },
    }));

    // Build nodes
    const allIds = new Set([...places, ...transitions]);
    setNodes(currentNodes => {
      return [...places, ...transitions].map(id => {
        const isPlace = places.includes(id);
        const existing = currentNodes.find(n => n.id === id);
        const position =
          nodePositions.current[id] ||
          existing?.position ||
          pendingPositions.current[id] ||
          { x: 150, y: 150 };

        const tokens = activeMark[id] ?? 0;
        const fireable = !isPlace && isSimulating && isEnabled(activeMark, pre, id);

        return {
          id,
          type: 'default',
          data: { label: id, tokens, isSimulating, fireable },
          position,
          style: {
            width: 40, height: 40,
            borderRadius: isPlace ? '50%' : '4px',
            background: '#1e293b',
            color: 'white',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: '10px',
            border: isSimulating && !isPlace
              ? `2px solid ${fireable ? '#10b981' : '#450a0a'}`
              : `2px solid ${isPlace ? '#3b82f6' : '#10b981'}`,
          },
        };
      });
    });

    setEdges(newEdges);
    setErrors(parseErrors);
  }, [code, isSimulating, simMarking]);

  // ── Pane click: add place or transition ──────────────────────────────────
  const onPaneClick = useCallback((e) => {
    if (isSimulating || !activeTool || activeTool === 'arc' || activeTool.includes('token')) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const prefix = activeTool === 'place' ? 'p' : 't';
    const regex = new RegExp(`(?:place|transition)\\s+(${prefix}\\d+)`, 'g');
    let max = 0, m;
    while ((m = regex.exec(code)) !== null) max = Math.max(max, parseInt(m[1].replace(prefix, '')));
    const newId = `${prefix}${max + 1}`;
    pendingPositions.current[newId] = { x: snap(flowPos.x) - 20, y: snap(flowPos.y) - 20 };
    const suffix = activeTool === 'place' ? `place ${newId}(0);` : `transition ${newId};`;
    setCode(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + suffix);
  }, [activeTool, code, screenToFlowPosition, isSimulating]);

  // ── Token edits write back into code initial marking ──────────────────────
  const adjustTokenInCode = useCallback((id, delta) => {
    setCode(prev => {
      return prev.split('\n').map(line => {
        const t = line.trim();
        if (!t.startsWith(`place ${id}`)) return line;
        const match = t.match(/\((\d+)\)/);
        const cur = match ? parseInt(match[1]) : 0;
        const next = Math.max(0, cur + delta);
        return match
          ? line.replace(/\(\d+\)/, `(${next})`)
          : line.replace(new RegExp(`place\\s+${id}`), `place ${id}(${next})`);
      }).join('\n');
    });
  }, []);

  // ── Fire transition via incidence matrix ──────────────────────────────────
  const handleFireTransition = useCallback((tId) => {
    const { places, transitions, arcs } = parseCode(code);
    const { pre, post } = buildMatrices(places, transitions, arcs);
    const currentMark = simMarking || {};
    if (!isEnabled(currentMark, pre, tId)) return;
    const next = fireTransition(currentMark, pre, post, tId);
    setSimMarking(next);
  }, [code, simMarking]);

  // ── Processed nodes (opacity for arc tool) ───────────────────────────────
  const processedNodes = useMemo(() => nodes.map(n => {
    const isSelectedSource = sourceNode?.id === n.id;
    const dimmed = activeTool === 'arc' && sourceNode
      && (sourceNode.id.startsWith('p') === n.id.startsWith('p'))
      && !isSelectedSource;
    return {
      ...n,
      draggable: !activeTool && !isSimulating,
      style: {
        ...n.style,
        opacity: dimmed ? 0.2 : 1,
        boxShadow: isSelectedSource ? '0 0 20px #3b82f6' : n.style?.boxShadow,
      },
    };
  }), [nodes, activeTool, sourceNode, isSimulating]);

  // ── Start / stop simulation ───────────────────────────────────────────────
  const toggleSimulation = () => {
    if (!isSimulating) {
      // seed marking from parsed code
      const { marking } = parseCode(code);
      setSimMarking(marking);
    } else {
      setSimMarking(null);
    }
    setIsSimulating(s => !s);
    setActiveTool(null);
    setSourceNode(null);
  };

  return (
    <div
      className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 overflow-hidden"
      onContextMenu={e => { e.preventDefault(); setActiveTool(null); setSourceNode(null); }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-slate-700 flex items-center px-4 bg-slate-800 shrink-0 gap-4 z-20 justify-between">
        <div className="flex items-center gap-4">
          <div className="font-bold text-lg italic text-blue-400 mr-4">TokenTracePN</div>
          <div className="flex gap-1 bg-slate-900 p-1 rounded border border-slate-700">
            {['place', 'transition', 'arc', '+token', '-token'].map(tool => (
              <button key={tool} disabled={isSimulating}
                onClick={() => setActiveTool(activeTool === tool ? null : tool)}
                className={`px-3 py-1 rounded text-[9px] font-black uppercase transition-all ${
                  activeTool === tool ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-400'
                } ${isSimulating ? 'opacity-20 cursor-not-allowed' : ''}`}>
                {tool}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <button onClick={toggleSimulation}
            className={`px-4 py-1.5 rounded text-[10px] font-black uppercase border transition-all ${
              isSimulating
                ? 'bg-red-600 border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.4)]'
                : 'bg-green-600 border-green-400'
            }`}>
            {isSimulating ? 'Stop Simulation' : 'Start Simulation'}
          </button>
          <button onClick={() => { setCode(INITIAL_CODE); setSimMarking(null); setIsSimulating(false); }}
            className="px-3 py-1.5 bg-slate-700 rounded text-[10px] font-bold uppercase">Reset</button>
          <button onClick={() => { setCode(''); setNodes([]); setSimMarking(null); setIsSimulating(false); }}
            className="px-3 py-1.5 bg-red-900/20 text-red-500 rounded text-[10px] font-bold uppercase hover:bg-red-900/40">Clear</button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 w-full">
        {/* ── Sidebar ────────────────────────────────────────────────────────── */}
        <aside className="w-80 lg:w-96 border-r border-slate-700 flex flex-col bg-slate-900 shrink-0 relative">
          <div className="flex-[2] flex flex-col min-h-0">
            <CodePanel code={code} onCodeChange={handleCodeChange} errors={errors} />
          </div>

          {isSimulating && (
            <div className="absolute inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-[1px] cursor-not-allowed">
              <span className="bg-slate-800 px-4 py-2 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 shadow-2xl tracking-widest">
                LOCKED FOR SIMULATION
              </span>
            </div>
          )}

          {/* System output */}
          <div className="flex-1 bg-slate-950/80 p-4 font-mono text-[11px] overflow-y-auto border-t border-slate-700">
            <span className="text-slate-600 uppercase text-[9px] font-bold block mb-2 tracking-widest">System Output</span>

            {isSimulating && simMarking && (
              <div className="mb-3">
                <div className="text-blue-400 text-[9px] uppercase tracking-widest mb-1">Live Marking M(t)</div>
                {Object.entries(simMarking).map(([id, tokens]) => (
                  <div key={id} className="text-slate-300 flex gap-2">
                    <span className="text-slate-500">{id}</span>
                    <span>{tokens} token{tokens !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTool
              ? <div className="text-orange-400 animate-pulse mb-1 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  MODE: {activeTool.toUpperCase()}
                </div>
              : <div className="text-slate-500 mb-1 italic">➜ IDLE</div>
            }

            {errors.map((err, i) => (
              <div key={i} className="text-red-400 text-[10px] mt-1">
                ✕ Row {err.line}: {err.msg}
              </div>
            ))}
          </div>
        </aside>

        {/* ── Canvas ─────────────────────────────────────────────────────────── */}
        <main className="flex-1 bg-slate-950 relative h-full">
          <ReactFlow
            nodes={processedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={onPaneClick}
            panOnDrag={!activeTool || isSimulating}
            snapToGrid
            snapGrid={[20, 20]}
            onNodeClick={(e, node) => {
              if (isSimulating) {
                if (!node.id.startsWith('p') && node.data.fireable) handleFireTransition(node.id);
                return;
              }
              if (activeTool === '+token' && node.id.startsWith('p')) adjustTokenInCode(node.id, 1);
              else if (activeTool === '-token' && node.id.startsWith('p')) adjustTokenInCode(node.id, -1);
              else if (activeTool === 'arc') {
                if (!sourceNode) {
                  setSourceNode(node);
                } else if (sourceNode.id.startsWith('p') !== node.id.startsWith('p')) {
                  setCode(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + `${sourceNode.id} -> ${node.id};`);
                  setSourceNode(null);
                } else {
                  setSourceNode(node);
                }
              }
            }}
            onMouseMove={e => {
              if (!activeTool || activeTool === 'arc' || activeTool.includes('token')) return;
              const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              setGhostPos({ x: snap(fp.x) - 20, y: snap(fp.y) - 20 });
            }}
          >
            <Background color="#1e293b" gap={20} variant="dots" />
            <GhostNode activeTool={activeTool} ghostPos={ghostPos} />
          </ReactFlow>
        </main>
      </div>
    </div>
  );
};

const Dashboard = () => (
  <ReactFlowProvider>
    <DashboardContent />
  </ReactFlowProvider>
);

export default Dashboard;
