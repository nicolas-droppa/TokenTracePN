import React, { useState, useCallback, memo, useEffect } from 'react';
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
      pointerEvents: 'none',
      zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', 
      color: 'white', fontSize: '10px', fontBlack: 'bold',
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
  const [code, setCode] = useState("");
  const [activeTool, setActiveTool] = useState(null);
  const [sourceNode, setSourceNode] = useState(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [errors, setErrors] = useState([]);

  const { screenToFlowPosition } = useReactFlow();

  // ID HELEPR
  const getNextId = (prefix) => {
    const regex = new RegExp(`(?:place|transition)\\s+(${prefix}\\d+)`, 'g');
    let max = 0;
    let match;
    while ((match = regex.exec(code)) !== null) {
      const num = parseInt(match[1].replace(prefix, ''));
      if (num > max) max = num;
    }
    return `${prefix}${max + 1}`;
  };

  // PARSER
  useEffect(() => {
    const nodeRegex = /^(place|transition)\s+([a-zA-Z0-9_]+)[\s;]/;
    const edgeRegex = /^([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)[\s;]/;
    const lines = code.split('\n').map(l => l.trim() + " ");
    const foundInCode = new Map();
    const duplicateIds = new Set();
    const currentErrors = [];

    lines.forEach((line, index) => {
      const nodeMatch = line.match(nodeRegex);
      if (nodeMatch) {
        const [_, type, id] = nodeMatch;
        if (foundInCode.has(id)) {
          duplicateIds.add(id);
          currentErrors.push(`Línia ${index + 1}: Duplicitné ID "${id}"`);
        } else {
          foundInCode.set(id, { type, index });
        }
      }
    });

    setNodes((currentNodes) => {
      const nextNodes = [];
      foundInCode.forEach((info, id) => {
        const existingNode = currentNodes.find(n => n.id === id);
        const isPlace = info.type === 'place';
        
        if (existingNode) {
          nextNodes.push({
            ...existingNode,
            style: {
              ...existingNode.style,
              borderColor: duplicateIds.has(id) ? '#ef4444' : (isPlace ? '#3b82f6' : '#10b981'),
              boxShadow: duplicateIds.has(id) ? '0 0 15px rgba(239, 68, 68, 0.6)' : 'none'
            }
          });
        } else {
          nextNodes.push({
            id, type: 'default', data: { label: id },
            position: { x: 100 + (nextNodes.length * 20), y: 100 + (info.index * 30) },
            style: {
              width: 40, height: 40, borderRadius: isPlace ? '50%' : '4px',
              background: '#1e293b', border: `2px solid ${isPlace ? '#3b82f6' : '#10b981'}`,
              color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center',
              fontSize: '10px', fontWeight: 'bold'
            }
          });
        }
      });
      return nextNodes;
    });

    setErrors(currentErrors);

    const newEdges = [];
    lines.forEach(line => {
      const edgeMatch = line.match(edgeRegex);
      if (edgeMatch) {
        const [_, src, tgt] = edgeMatch;
        if (foundInCode.has(src) && foundInCode.has(tgt)) {
          newEdges.push({
            id: `e-${src}-${tgt}`, source: src, target: tgt, type: 'straight',
            markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#94a3b8' },
            style: { stroke: '#94a3b8', strokeWidth: 2 }, animated: true
          });
        }
      }
    });
    setEdges(newEdges);
  }, [code]);

  const onNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);

  const onPaneClick = useCallback((e) => {
    if (!activeTool || activeTool === 'arc') { 
      setSourceNode(null); 
      return; 
    }
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newId = getNextId(activeTool === 'place' ? 'p' : 't');
    
    setCode(prev => prev + (prev && !prev.endsWith('\n') ? "\n" : "") + `${activeTool} ${newId};`);
    
    setTimeout(() => {
      setNodes(nds => nds.map(n => n.id === newId ? { ...n, position: { x: snapValue(pos.x) - 20, y: snapValue(pos.y) - 20 } } : n));
    }, 10);
  }, [activeTool, code, screenToFlowPosition]);

  const onNodeClick = useCallback((e, node) => {
    if (activeTool !== 'arc') return;

    e.stopPropagation();

    if (!sourceNode) {
      setSourceNode(node);
    } else {
      const sourceIsPlace = sourceNode.id.startsWith('p');
      const targetIsPlace = node.id.startsWith('p');

      if (sourceIsPlace !== targetIsPlace) {
        setCode(prev => prev + (prev && !prev.endsWith('\n') ? "\n" : "") + `${sourceNode.id} -> ${node.id};`);
        setSourceNode(null);
      } else {
        setSourceNode(node); 
      }
    }
  }, [activeTool, sourceNode]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 overflow-hidden select-none"
         onContextMenu={(e) => { e.preventDefault(); setActiveTool(null); setSourceNode(null); }}>
      
      <header className="h-14 border-b border-slate-700 flex items-center px-4 bg-slate-800 shrink-0 gap-4 z-20 shadow-xl">
        <div className="font-bold text-lg mr-4 italic text-blue-400">TokenTracePN</div>
        <div className="flex gap-2">
          {['place', 'transition', 'arc'].map(tool => (
            <button key={tool} onClick={() => { setActiveTool(activeTool === tool ? null : tool); setSourceNode(null); }}
              className={`px-4 py-1.5 rounded text-[10px] font-black border uppercase transition-all ${
                activeTool === tool ? 'bg-blue-600 border-white' : 'bg-slate-700 border-transparent hover:bg-slate-600'
              }`}>{tool === 'arc' ? '⤴ Arc Tool' : `+ ${tool}`}</button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 w-full">
        <aside className="w-80 lg:w-96 border-r border-slate-700 flex flex-col bg-slate-900 shrink-0 h-full">
          <div className="flex-[2] flex flex-col min-h-0 border-b border-slate-700">
             <CodePanel code={code} onCodeChange={setCode} />
          </div>
          <div className="flex-1 bg-slate-950/50 p-4 font-mono text-[11px] overflow-y-auto">
             <span className="text-slate-600 uppercase text-[9px] font-bold block mb-2">System Output</span>
             {activeTool ? (
               <div className="text-orange-400 animate-pulse mb-1">➜ Mode: {activeTool.toUpperCase()}</div>
             ) : (
               <div className="text-slate-500 mb-1 italic">➜ Edit mode (Drag enabled)</div>
             )}
             {sourceNode && <div className="text-blue-400 italic">➜ Source: {sourceNode.id} (Select target)</div>}
             {errors.map((err, i) => <div key={i} className="text-red-400 mt-1">✖ {err}</div>)}
          </div>
        </aside>

        <main className="flex-1 bg-slate-950 relative h-full min-h-0">
          <ReactFlow 
            nodes={nodes.map(n => {
              const isSelectedSource = sourceNode?.id === n.id;
              let opacity = 1;
              if (activeTool === 'arc' && sourceNode) {
                const sourceIsPlace = sourceNode.id.startsWith('p');
                const targetIsPlace = n.id.startsWith('p');
                if (sourceIsPlace === targetIsPlace && !isSelectedSource) opacity = 0.2;
              }
              return {
                ...n,
                draggable: !activeTool, 
                style: {
                  ...n.style,
                  opacity,
                  boxShadow: isSelectedSource ? '0 0 20px #3b82f6' : n.style.boxShadow,
                  transition: 'opacity 0.2s, box-shadow 0.2s',
                  cursor: activeTool ? (activeTool === 'arc' ? 'pointer' : 'crosshair') : 'grab'
                }
              };
            })}
            edges={edges} 
            nodeTypes={nodeTypes} 
            onNodesChange={onNodesChange} 
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick} 
            onPaneClick={onPaneClick}
            onMouseMove={(e) => {
              if (!activeTool || activeTool === 'arc') return;
              const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              setGhostPos({ x: snapValue(flowPos.x) - 20, y: snapValue(flowPos.y) - 20 });
            }}
            snapToGrid={true} 
            snapGrid={[20, 20]} 
            panOnDrag={!activeTool}
            nodesConnectable={false}
            selectNodesOnDrag={false}
            nodesDraggable={!activeTool}
          >
            <Background color="#1e293b" gap={20} variant="dots" />
            <Controls />
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