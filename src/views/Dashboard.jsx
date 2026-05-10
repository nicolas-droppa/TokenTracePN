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

const snapValue = (value, step = 20) => Math.round(value / step) * step;

const CustomNode = memo(({ id, data }) => {
  const isPlace = id.startsWith('p');
  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none transition-all duration-200">
      <span className="z-10 font-bold">{isPlace ? (data.tokens || '') : id}</span>
      {isPlace && (
        <span className="absolute -bottom-5 text-[9px] text-slate-500 font-mono">{id}</span>
      )}
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="target" position={Position.Bottom} className="opacity-0" />
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="target" position={Position.Right} className="opacity-0" />
      <Handle type="source" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      <Handle type="source" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
});

const nodeTypes = { default: CustomNode };

const GhostNode = memo(({ activeTool, ghostPos }) => {
  const { x: viewX, y: viewY, zoom } = useViewport();
  if (!activeTool || activeTool === 'arc' || activeTool.includes('token')) return null;
  const isPlace = activeTool === 'place';
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: 40, height: 40,
      pointerEvents: 'none', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: '10px', fontWeight: 'bold',
      borderRadius: isPlace ? '50%' : '4px',
      border: `2px dashed ${isPlace ? '#3b82f6' : '#10b981'}`,
      backgroundColor: isPlace ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
      transform: `translate(${viewX + ghostPos.x * zoom}px, ${viewY + ghostPos.y * zoom}px) scale(${zoom})`,
      transformOrigin: '0 0',
    }}>
      {isPlace ? 'P' : 'T'}
    </div>
  );
});

const DashboardContent = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const initialCode = `place p1(1);\ntransition t1;\np1 -> t1;`;
  const [code, setCode] = useState(initialCode);
  const [activeTool, setActiveTool] = useState(null);
  const [sourceNode, setSourceNode] = useState(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [errors, setErrors] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  
  const pendingPositions = useRef({});

  const { screenToFlowPosition } = useReactFlow();

  const onNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);
  const handleCodeChange = useCallback((newCode) => setCode(newCode), []);

  const updateTokensInCode = (id, delta) => {
    const lines = code.split('\n');
    const newLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith(`place ${id}`)) {
        const match = trimmed.match(/\((\d+)\)/);
        const current = match ? parseInt(match[1]) : 0;
        const next = Math.max(0, current + delta);
        return trimmed.includes('(') 
          ? line.replace(/\(\d+\)/, `(${next})`)
          : line.replace(new RegExp(`place\\s+${id}`), `place ${id}(${next})`);
      }
      return line;
    });
    setCode(newLines.join('\n'));
  };

  const fireTransition = (tId) => {
    const incoming = edges.filter(e => e.target === tId);
    const outgoing = edges.filter(e => e.source === tId);
    let newCode = code;

    incoming.forEach(edge => {
      const match = newCode.match(new RegExp(`place\\s+${edge.source}\\((\\d+)\\)`));
      const val = match ? parseInt(match[1]) : 0;
      newCode = newCode.replace(new RegExp(`place\\s+${edge.source}\\(\\d+\\)`), `place ${edge.source}(${val - 1})`);
    });
    outgoing.forEach(edge => {
      const match = newCode.match(new RegExp(`place\\s+${edge.target}\\((\\d+)\\)`));
      const val = match ? parseInt(match[1]) : 0;
      newCode = newCode.replace(new RegExp(`place\\s+${edge.target}\\(\\d+\\)`), `place ${edge.target}(${val + 1})`);
    });
    setCode(newCode);
  };

  useEffect(() => {
    const nodeRegex = /^(place|transition)\s+([a-zA-Z0-9_]+)(?:\((\d+)\))?[\s;]*/;
    const edgeRegex = /^([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)[\s;]*/;
    const lines = code.split('\n');
    const foundInCode = new Map();
    const currentErrors = [];

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) return;
      const nodeMatch = line.match(nodeRegex);
      if (nodeMatch) {
        const [_, type, id, tokens] = nodeMatch;
        if (foundInCode.has(id)) currentErrors.push(`Row ${index + 1}: Duplicate ID "${id}"`);
        else foundInCode.set(id, { type, tokens: parseInt(tokens || 0) });
      }
    });

    const newEdges = [];
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) return;
      const edgeMatch = line.match(edgeRegex);
      if (edgeMatch) {
        const [_, src, tgt] = edgeMatch;
        if (foundInCode.has(src) && foundInCode.has(tgt)) {
          newEdges.push({
            id: `e-${src}-${tgt}-${index}`,
            source: src, target: tgt, type: 'straight', animated: isSimulating,
            markerEnd: { type: MarkerType.ArrowClosed, color: isSimulating ? '#3b82f6' : '#94a3b8' },
            style: { stroke: isSimulating ? '#3b82f6' : '#475569', strokeWidth: 2 },
          });
        } else if (!(index === lines.length - 1 && !line.endsWith(';'))) {
          currentErrors.push(`Row ${index + 1}: Node does not exist.`);
        }
      }
    });

    setNodes((currentNodes) => {
      return Array.from(foundInCode).map(([id, info]) => {
        const existing = currentNodes.find(n => n.id === id);
        const isPlace = info.type === 'place';
        
        let isFireable = false;
        if (!isPlace && isSimulating) {
            const inEdges = newEdges.filter(e => e.target === id);
            isFireable = inEdges.length > 0 && inEdges.every(e => (foundInCode.get(e.source)?.tokens || 0) > 0);
        }

        const position = existing ? existing.position : (pendingPositions.current[id] || { x: 150, y: 150 });

        return {
          id, type: 'default',
          data: { label: id, tokens: info.tokens, isSimulating, fireable: isFireable },
          position,
          style: {
            width: 40, height: 40, borderRadius: isPlace ? '50%' : '4px',
            background: '#1e293b', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '10px',
            border: isSimulating && !isPlace 
              ? `2px solid ${isFireable ? '#10b981' : '#450a0a'}` 
              : `2px solid ${isPlace ? '#3b82f6' : '#10b981'}`
          }
        };
      });
    });

    setEdges(newEdges);
    setErrors(currentErrors);
  }, [code, isSimulating]);

  const onPaneClick = useCallback((e) => {
    if (isSimulating || !activeTool || activeTool === 'arc' || activeTool.includes('token')) return;
    
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const prefix = activeTool === 'place' ? 'p' : 't';
    
    const regex = new RegExp(`(?:place|transition)\\s+(${prefix}\\d+)`, 'g');
    let max = 0; let m;
    while ((m = regex.exec(code)) !== null) max = Math.max(max, parseInt(m[1].replace(prefix, '')));
    const newId = `${prefix}${max + 1}`;
    
    pendingPositions.current[newId] = { x: snapValue(flowPos.x) - 20, y: snapValue(flowPos.y) - 20 };
    
    setCode(prev => prev + (prev && !prev.endsWith('\n') ? "\n" : "") + `${activeTool} ${newId}${activeTool === 'place' ? '(0)' : ''};`);
  }, [activeTool, code, screenToFlowPosition, isSimulating]);

  const processedNodes = useMemo(() => {
    return nodes.map(n => {
      const isSelectedSource = sourceNode?.id === n.id;
      let opacity = (activeTool === 'arc' && sourceNode && sourceNode.id.startsWith('p') === n.id.startsWith('p') && !isSelectedSource) ? 0.2 : 1;
      return {
        ...n,
        draggable: !activeTool && !isSimulating,
        style: { ...n.style, opacity, boxShadow: isSelectedSource ? '0 0 20px #3b82f6' : n.style.boxShadow }
      };
    });
  }, [nodes, activeTool, sourceNode, isSimulating]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 overflow-hidden"
          onContextMenu={(e) => { e.preventDefault(); setActiveTool(null); setSourceNode(null); }}>
      
      <header className="h-14 border-b border-slate-700 flex items-center px-4 bg-slate-800 shrink-0 gap-4 z-20 justify-between">
        <div className="flex items-center gap-4">
            <div className="font-bold text-lg italic text-blue-400 mr-4">TokenTracePN</div>
            <div className="flex gap-1 bg-slate-900 p-1 rounded border border-slate-700">
                {['place', 'transition', 'arc', '+token', '-token'].map(tool => (
                    <button key={tool} disabled={isSimulating}
                        onClick={() => setActiveTool(activeTool === tool ? null : tool)}
                        className={`px-3 py-1 rounded text-[9px] font-black uppercase transition-all ${
                            activeTool === tool ? 'bg-blue-600 border-white text-white' : 'hover:bg-slate-700 text-slate-400'
                        } ${isSimulating ? 'opacity-20 cursor-not-allowed' : ''}`}>{tool}</button>
                ))}
            </div>
        </div>

        <div className="flex gap-2 items-center">
            <button onClick={() => { setIsSimulating(!isSimulating); setActiveTool(null); setSourceNode(null); }}
                className={`px-4 py-1.5 rounded text-[10px] font-black uppercase border transition-all ${
                    isSimulating ? 'bg-red-600 border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.4)]' : 'bg-green-600 border-green-400'
                }`}>{isSimulating ? 'Stop Simulation' : 'Start Simulation'}</button>
            <button onClick={() => setCode(initialCode)} className="px-3 py-1.5 bg-slate-700 rounded text-[10px] font-bold uppercase">Reset</button>
            <button onClick={() => { setCode(''); setNodes([]); }} className="px-3 py-1.5 bg-red-900/20 text-red-500 rounded text-[10px] font-bold uppercase hover:bg-red-900/40">Clear</button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 w-full">
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
          
          <div className="flex-1 bg-slate-950/80 p-4 font-mono text-[11px] overflow-y-auto border-t border-slate-700">
             <span className="text-slate-600 uppercase text-[9px] font-bold block mb-2 tracking-widest">System Output</span>
             {activeTool ? (
                <div className="text-orange-400 animate-pulse mb-1 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400" /> MODE: {activeTool.toUpperCase()}
                </div>
             ) : <div className="text-slate-500 mb-1 italic">➜ IDLE</div>}
             {errors.map((err, i) => <div key={i} className="text-red-400 text-[10px] mt-1">✕ {err}</div>)}
          </div>
        </aside>

        <main className="flex-1 bg-slate-950 relative h-full">
          <ReactFlow
            nodes={processedNodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onPaneClick={onPaneClick}
            panOnDrag={!activeTool || isSimulating}
            onNodeClick={(e, node) => {
                if (isSimulating) {
                    if (node.id.startsWith('t') && node.data.fireable) fireTransition(node.id);
                    return;
                }
                if (activeTool === '+token' && node.id.startsWith('p')) updateTokensInCode(node.id, 1);
                else if (activeTool === '-token' && node.id.startsWith('p')) updateTokensInCode(node.id, -1);
                else if (activeTool === 'arc') {
                    if (!sourceNode) setSourceNode(node);
                    else if (sourceNode.id.startsWith('p') !== node.id.startsWith('p')) {
                        setCode(prev => prev + (prev && !prev.endsWith('\n') ? "\n" : "") + `${sourceNode.id} -> ${node.id};`);
                        setSourceNode(null);
                    } else setSourceNode(node);
                }
            }}
            onMouseMove={(e) => {
              if (!activeTool || activeTool === 'arc' || activeTool.includes('token')) return;
              const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              setGhostPos({ x: snapValue(flowPos.x) - 20, y: snapValue(flowPos.y) - 20 });
            }}
            snapToGrid={true} snapGrid={[20, 20]}
          >
            <Background color="#1e293b" gap={20} variant="dots" />
            <GhostNode activeTool={activeTool} ghostPos={ghostPos} />
          </ReactFlow>
        </main>
      </div>
    </div>
  );
};

const Dashboard = () => (<ReactFlowProvider><DashboardContent /></ReactFlowProvider>);
export default Dashboard;