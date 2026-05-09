import React, { useState, useCallback, useRef, memo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  applyNodeChanges, 
  applyEdgeChanges,
  addEdge,
  useReactFlow, 
  ReactFlowProvider,
  useViewport,
  MarkerType,
  Handle, // Pridané pre stredové body
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import CodePanel from '../components/editor/CodePanel';

const snapValue = (value, step = 20) => Math.round(value / step) * step;

// --- GHOST KOMPONENT ---
const GhostNode = memo(({ activeTool, ghostPos }) => {
  const { x: viewX, y: viewY, zoom } = useViewport();
  if (!activeTool || activeTool === 'arc') return null;

  const isPlace = activeTool === 'place';
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: 40, height: 40, pointerEvents: 'none', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 'bold',
      borderRadius: isPlace ? '50%' : '4px', border: `2px dashed ${isPlace ? '#3b82f6' : '#10b981'}`,
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
  
  const pCounter = useRef(1);
  const tCounter = useRef(1);
  const { screenToFlowPosition } = useReactFlow();

  const onNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    setActiveTool(null);
    setSourceNode(null);
  }, []);

  // --- LOGIKA SPÁJANIA ---
  const onNodeClick = useCallback((event, node) => {
    if (activeTool !== 'arc') return;

    if (!sourceNode) {
      setSourceNode(node);
    } else {
      const sourceIsPlace = sourceNode.id.startsWith('p');
      const targetIsPlace = node.id.startsWith('p');

      if (sourceIsPlace !== targetIsPlace && sourceNode.id !== node.id) {
        const newEdge = {
          id: `e-${sourceNode.id}-${node.id}`,
          source: sourceNode.id,
          target: node.id,
          type: 'straight',
          markerEnd: { 
            type: MarkerType.ArrowClosed, 
            width: 15,  // Zmenšili sme z 20-25 na 15
            height: 15,
            color: '#94a3b8',
          },
          style: { 
            stroke: '#94a3b8', 
            strokeWidth: 2 
          },
          // Tento parameter vytlačí šípku zo stredu na okraj!
          // Pre 40px uzol skús hodnotu okolo 20-22
          label: "", // niekedy pomáha vynulovať label
        };

        setEdges((eds) => addEdge(newEdge, eds));
        setCode((prev) => prev + (prev && !prev.endsWith('\n') ? "\n" : "") + `${sourceNode.id} -> ${node.id};`);
        setSourceNode(null);
      } else {
        setSourceNode(node);
      }
    }
  }, [activeTool, sourceNode]);

  const createNode = useCallback((type, position) => {
    const isPlace = type === 'place';
    const newId = isPlace ? `p${pCounter.current++}` : `t${tCounter.current++}`;
    
    const newNode = {
      id: newId,
      // Odstránime sourcePosition a targetPosition, necháme to na automatiku
      data: { 
        label: (
          <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
            <span className="z-10">{newId}</span>
            
            {/* Vstupné body (Target) */}
            <Handle type="target" position={Position.Top} className="floating-handle" />
            <Handle type="target" position={Position.Bottom} className="floating-handle" />
            <Handle type="target" position={Position.Left} className="floating-handle" />
            <Handle type="target" position={Position.Right} className="floating-handle" />
            
            {/* Výstupné body (Source) */}
            <Handle type="source" position={Position.Top} className="floating-handle" />
            <Handle type="source" position={Position.Bottom} className="floating-handle" />
            <Handle type="source" position={Position.Left} className="floating-handle" />
            <Handle type="source" position={Position.Right} className="floating-handle" />
          </div>
        ) 
      },
      position: { x: snapValue(position.x) - 20, y: snapValue(position.y) - 20 },
      style: {
        width: 40, height: 40, borderRadius: isPlace ? '50%' : '4px',
        background: '#1e293b', 
        border: `2px solid ${isPlace ? '#3b82f6' : '#10b981'}`,
        color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center',
        fontSize: '10px', fontWeight: 'bold',
        cursor: 'move',
      }
    };
    setNodes((nds) => [...nds, newNode]);
    setCode((prev) => prev + (prev && !prev.endsWith('\n') ? "\n" : "") + `${type} ${newId};`);
  }, []);

  const onPaneClick = useCallback((event) => {
    if (activeTool === 'arc') {
      setSourceNode(null);
      return;
    }
    if (!activeTool) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createNode(activeTool, position);
  }, [activeTool, createNode, screenToFlowPosition]);

  const onMouseMove = useCallback((event) => {
    if (!activeTool || activeTool === 'arc') return;
    const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setGhostPos({ x: snapValue(flowPos.x) - 20, y: snapValue(flowPos.y) - 20 });
  }, [activeTool, screenToFlowPosition]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 overflow-hidden select-none" 
         onContextMenu={handleContextMenu}>
      
      <header className="h-14 border-b border-slate-700 flex items-center px-4 bg-slate-800 shrink-0 gap-4 z-20 shadow-xl">
        <div className="font-bold text-lg mr-4 italic text-blue-400">TokenTracePN</div>
        <div className="flex gap-2">
          {['place', 'transition', 'arc'].map((tool) => (
            <button
              key={tool}
              onClick={() => {
                setActiveTool(activeTool === tool ? null : tool);
                setSourceNode(null);
              }}
              className={`px-4 py-1.5 rounded text-[10px] font-black border uppercase transition-all ${
                activeTool === tool ? 'bg-blue-600 border-white scale-105 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-slate-700 border-transparent hover:bg-slate-600'
              }`}
            >
              {tool === 'arc' ? '⤴ Arc Tool' : `+ ${tool}`}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 w-full">
        <aside className="w-80 lg:w-96 border-r border-slate-700 flex flex-col bg-slate-900 shrink-0 h-full">
          <div className="flex-[2] flex flex-col min-h-0 border-b border-slate-700">
             <CodePanel code={code} onCodeChange={setCode} />
          </div>
          <div className="flex-1 bg-slate-950/50 p-4 font-mono text-[11px]">
             <span className="text-slate-600 uppercase text-[9px] font-bold">System Output</span>
             {activeTool && <div className="text-orange-400 mt-1 animate-pulse">➜ Mode: {activeTool.toUpperCase()}</div>}
             {sourceNode && <div className="text-blue-400 mt-1">➜ Source: {sourceNode.id} (Select target)</div>}
          </div>
        </aside>

        <main className="flex-1 bg-slate-950 relative h-full min-h-0">
          <ReactFlow 
            nodes={nodes.map(n => ({
              ...n,
              style: { 
                ...n.style, 
                boxShadow: sourceNode?.id === n.id ? '0 0 20px #3b82f6' : 'none',
                opacity: (activeTool === 'arc' && sourceNode && n.id.startsWith(sourceNode.id[0])) ? 0.5 : 1
              }
            }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onMouseMove={onMouseMove}
            snapToGrid={true}
            snapGrid={[20, 20]}
            panOnDrag={!activeTool}
            nodesConnectable={false}
            // Zabezpečíme, aby šípky nekončili úplne v strede, ale na okraji
            style={{ width: '100%', height: '100%', cursor: activeTool ? 'crosshair' : 'grab' }}
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
  <ReactFlowProvider>
    <DashboardContent />
  </ReactFlowProvider>
);

export default Dashboard;