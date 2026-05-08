import { useState } from 'react'
import { Activity } from 'lucide-react'

function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 flex flex-col items-center">
        <Activity className="w-16 h-16 text-blue-400 mb-4 animate-pulse" />
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          TokenTracePN
        </h1>
        <p className="mt-2 text-slate-400">Vizualizácia Petriho sietí</p>
        
        <button className="mt-8 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors font-medium">
          Spustiť analýzu
        </button>
      </div>
    </div>
  )
}

export default App