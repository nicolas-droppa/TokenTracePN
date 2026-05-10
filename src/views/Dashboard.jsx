import React, { useState, useCallback, memo, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
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

const CustomNode = memo(({ id }) => (
  <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none">
    <span className="z-10">{id}</span>
    <Handle type="target" position={Position.Top} className="opacity-0" />
    <Handle type="target" position={Position.Bottom} className="opacity-0" />
    <Handle type="target" position={Position.Left} className="opacity-0" />
    <Handle type="target" position={Position.Right} className="opacity-0" />
    <Handle type="source" position={Position.Top} className="opacity-0" />
    <Handle type="source" position={Position.Bottom} className="opacity-0" />
    <Handle type="source" position={Position.Left} className="opacity-0" />
    <Handle type="source" position={Position.Right} className="opacity-0" />
  </div>
));

const nodeTypes = { default: CustomNode };

const GhostNode = memo(({ activeTool, ghostPos }) => {
  const { x: viewX, y: viewY, zoom } = useViewport();
  if (!activeTool || activeTool === 'arc') return null;
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

  const initialCode = `// place p1;\n// transition t1;\n// p1 -> t1;`;

  const [code, setCode] = useState(initialCode);
  const [activeTool, setActiveTool] = useState(null);
  const [sourceNode, setSourceNode] = useState(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [errors, setErrors] = useState([]);

  const { screenToFlowPosition } = useReactFlow();

  const onNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);
  const handleCodeChange = useCallback((newCode) => setCode(newCode), []);

  // --- PARSER ---
  useEffect(() => {
    const nodeRegex = /^(place|transition)\s+([a-zA-Z0-9_]+)[\s;]*/;
    const edgeRegex = /^([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)[\s;]*/;
    const lines = code.split('\n');
    
    const foundInCode = new Map();
    const currentErrors = [];

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) return;

      const nodeMatch = line.match(nodeRegex);
      if (nodeMatch) {
        const [_, type, id] = nodeMatch;
        if (foundInCode.has(id)) {
          currentErrors.push(`Riadok ${index + 1}: Duplicitné ID "${id}"`);
        } else {
          foundInCode.set(id, { type, index });
        }
      }
    });

    const newEdges = [];
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) return;

      const isLastLine = index === lines.length - 1;
      const isBeingTyped = isLastLine && !line.endsWith(';');

      const edgeMatch = line.match(edgeRegex);
      const nodeMatch = line.match(nodeRegex);

      if (edgeMatch) {
        const [_, src, tgt] = edgeMatch;
        if (foundInCode.has(src) && foundInCode.has(tgt)) {
          newEdges.push({
            id: `e-${src}-${tgt}-${index}`,
            source: src, target: tgt, type: 'straight', animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
            style: { stroke: '#94a3b8', strokeWidth: 2 },
          });
        } else if (!isBeingTyped) {
          const missing = !foundInCode.has(src) ? src : tgt;
          currentErrors.push(`Riadok ${index + 1}: Uzol "${missing}" neexistuje.`);
        }
      } else if (!nodeMatch && !isBeingTyped) {
        currentErrors.push(`Riadok ${index + 1}: Neznáma syntax.`);
      }
    });

    setNodes((currentNodes) => {
      const nextNodes = [];
      foundInCode.forEach((info, id) => {
        const existing = currentNodes.find(n => n.id === id);
        const isPlace = info.type === 'place';
        if (existing) {
          nextNodes.push({ ...existing, 
            style: { ...existing.style, border: `2px solid ${isPlace ? '#3b82f6' : '#10b981'}` }
          });
        } else {
          nextNodes.push({
            id, type: 'default', data: { label: id },
            position: { x: 150, y: 150 },
            style: { width: 40, height: 40, borderRadius: isPlace ? '50%' : '4px', background: '#1e293b', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '10px', border: `2px solid ${isPlace ? '#3b82f6' : '#10b981'}` }
          });
        }
      });
      return nextNodes;
    });

    setEdges(newEdges);
    setErrors(currentErrors);
  }, [code]);
 
  const onDeleteNode = useCallback((e, node) => {
    e.preventDefault(); e.stopPropagation();
    const lines = code.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      const isDef = trimmed.startsWith(`place ${node.id}`) || trimmed.startsWith(`transition ${node.id}`);
      const isEdge = trimmed.includes(` ${node.id} `) || trimmed.startsWith(`${node.id} `) || trimmed.endsWith(` ${node.id};`) || trimmed.includes(`${node.id}->`) || trimmed.includes(`->${node.id}`);
      return !isDef && !isEdge;
    });
    setCode(filteredLines.join('\n'));
  }, [code]);

  const onDeleteEdge = useCallback((e, edge) => {
    e.preventDefault(); e.stopPropagation();
    const lines = code.split('\n');
    const edgeString = `${edge.source} -> ${edge.target}`;
    const filteredLines = lines.filter(line => !line.trim().startsWith(edgeString));
    setCode(filteredLines.join('\n'));
  }, [code]);

  const onPaneClick = useCallback((e) => {
    if (!activeTool || activeTool === 'arc') return;

    const flowPos = screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });

    const prefix = activeTool === 'place' ? 'p' : 't';
    const regex = new RegExp(`(?:place|transition)\\s+(${prefix}\\d+)`, 'g');
    let max = 0; let match;
    while ((match = regex.exec(code)) !== null) {
      const num = parseInt(match[1].replace(prefix, ''));
      if (num > max) max = num;
    }
    const newId = `${prefix}${max + 1}`;

    const newNode = {
      id: newId,
      type: 'default',
      data: { label: newId },
      position: { x: snapValue(flowPos.x) - 20, y: snapValue(flowPos.y) - 20 },
      style: {
        width: 40, height: 40,
        borderRadius: activeTool === 'place' ? '50%' : '4px',
        background: '#1e293b',
        border: `2px solid ${activeTool === 'place' ? '#3b82f6' : '#10b981'}`,
        color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '10px', fontWeight: 'bold'
      }
    };

    setNodes(nds => [...nds, newNode]);
    setCode(prev => prev + (prev && !prev.endsWith('\n') ? "\n" : "") + `${activeTool} ${newId};`);
  }, [activeTool, code, screenToFlowPosition]);

  const processedNodes = useMemo(() => {
    return nodes.map(n => {
      const isSelectedSource = sourceNode?.id === n.id;
      let opacity = (activeTool === 'arc' && sourceNode && sourceNode.id.startsWith('p') === n.id.startsWith('p') && !isSelectedSource) ? 0.2 : 1;
      return {
        ...n,
        draggable: !activeTool,
        style: { ...n.style, opacity, boxShadow: isSelectedSource ? '0 0 20px #3b82f6' : n.style.boxShadow }
      };
    });
  }, [nodes, activeTool, sourceNode]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 overflow-hidden"
          onContextMenu={(e) => { e.preventDefault(); setActiveTool(null); setSourceNode(null); }}>
      
      <header className="h-14 border-b border-slate-700 flex items-center px-4 bg-slate-800 shrink-0 gap-4 z-20">
        <div className="font-bold text-lg mr-4 italic text-blue-400">TokenTracePN</div>
        <div className="flex gap-2">
          {['place', 'transition', 'arc'].map(tool => (
            <button key={tool} onClick={() => { setActiveTool(activeTool === tool ? null : tool); setSourceNode(null); }}
              className={`px-4 py-1.5 rounded text-[10px] font-black border uppercase transition-all ${
                activeTool === tool ? 'bg-blue-600 border-white shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-slate-700 border-transparent hover:bg-slate-600'
              }`}>{tool}</button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 w-full">
        {/* ASIDE S PRIDANÝM CLICK HANDLEROM PRE RESET SELEKCIE */}
        <aside 
          onClick={() => { setActiveTool(null); setSourceNode(null); }}
          className="w-80 lg:w-96 border-r border-slate-700 flex flex-col bg-slate-900 shrink-0"
        >
          <div className="flex-[2] flex flex-col min-h-0">
            <CodePanel 
              code={code} 
              onCodeChange={handleCodeChange} 
              errors={errors}
            />
          </div>
          
          <div className="flex-1 bg-slate-950/80 p-4 font-mono text-[11px] overflow-y-auto border-t border-slate-700">
             <span className="text-slate-600 uppercase text-[9px] font-bold block mb-2 tracking-widest">System Output</span>
             {activeTool ? (
               <div className="text-orange-400 animate-pulse mb-1">➜ MODE: {activeTool.toUpperCase()} ACTIVE</div>
             ) : (
               <div className="text-slate-500 mb-1 italic">➜ IDLE: Drag nodes to rearrange</div>
             )}
             
             {sourceNode && (
               <div className="text-blue-400 border-l-2 border-blue-500 pl-2 my-2 bg-blue-500/5 py-1">
                 SOURCE: <span className="font-bold">{sourceNode.id}</span><br/>
                 <span className="text-[9px] text-blue-300/60 uppercase">Select target {sourceNode.id.startsWith('p') ? 'transition' : 'place'}</span>
               </div>
             )}

             {errors.length > 0 && (
               <div className="mt-2 space-y-1.5">
                 {errors.map((err, i) => {
                    const [lineLabel, ...message] = err.split(': ');
                    return (
                      <div key={i} className="flex items-start gap-2 text-red-400 bg-red-500/5 p-1 rounded border border-transparent hover:border-red-500/20 transition-colors group">
                        <span className="bg-red-500/20 text-red-500 text-[9px] px-1.5 py-0.5 rounded font-bold min-w-[32px] text-center border border-red-500/30 group-hover:bg-red-500 group-hover:text-white transition-all">
                          {lineLabel.replace('Riadok ', 'L')}
                        </span>
                        <span className="pt-0.5">{message.join(': ')}</span>
                      </div>
                    );
                 })}
               </div>
             )}
             <div className="mt-4 text-slate-700 text-[9px] uppercase">Right-click element to delete</div>
          </div>
        </aside>

        <main className="flex-1 bg-slate-950 relative h-full">
          <ReactFlow
            nodes={processedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onDeleteNode}
            onEdgeContextMenu={onDeleteEdge}
            // ZAKÁZANIE PANNINGU KEĎ JE AKTÍVNY NÁSTROJ
            panOnDrag={!activeTool}
            onNodeClick={(e, node) => {
              if (activeTool !== 'arc') return;
              e.stopPropagation();
              if (!sourceNode) setSourceNode(node);
              else if (sourceNode.id.startsWith('p') !== node.id.startsWith('p')) {
                setCode(prev => prev + (prev && !prev.endsWith('\n') ? "\n" : "") + `${sourceNode.id} -> ${node.id};`);
                setSourceNode(null);
              } else setSourceNode(node);
            }}
            onMouseMove={(e) => {
              if (!activeTool || activeTool === 'arc') return;
              const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              setGhostPos({ x: snapValue(flowPos.x) - 20, y: snapValue(flowPos.y) - 20 });
            }}
            snapToGrid={true}
            snapGrid={[20, 20]}
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
  <ReactFlowProvider><DashboardContent /></ReactFlowProvider>
);

export default Dashboard;