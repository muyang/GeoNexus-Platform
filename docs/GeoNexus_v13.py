import os
import http.server
import socketserver

print("🌍 正在构建 GeoNexus v13 (全语种 + 南非边界 + 内容扩充)...")

html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GeoNexus: Global GeoAI Hub</title>
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

    <style>
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .glass { background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); }
        .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.05); }
        
        /* 视图切换 */
        .view-section { display: none; animation: fadeIn 0.3s ease-out; }
        .view-active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* AI 面板 */
        #ai-panel { transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .ai-initial { height: 60px; width: 600px; border-radius: 99px; } 
        .ai-expanded { height: 500px; width: 600px; border-radius: 24px; }
        .ai-minimized { height: 40px; width: 280px; border-radius: 99px; transform: translateY(20px); background: #059669 !important; border-color: #34d399 !important; }

        /* 复选框动画 */
        .check-circle { transition: all 0.2s; }
        .checked .check-circle { background-color: #3b82f6; border-color: #3b82f6; }
        
        /* Builder 连线 SVG */
        .connector-line { stroke: #64748b; stroke-width: 2; stroke-dasharray: 5; animation: dash 30s linear infinite; }
        @keyframes dash { to { stroke-dashoffset: -1000; } }
    </style>
</head>
<body class="bg-slate-950 text-slate-200 h-screen w-screen overflow-hidden flex select-none">

    <div class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <div id="lang-menu" class="hidden glass p-2 rounded-xl mb-2 flex flex-col gap-1 w-32 shadow-2xl transition-all">
            <button onclick="setLang('zh')" class="px-3 py-2 hover:bg-white/10 rounded text-left text-sm flex items-center gap-2">🇨🇳 中文</button>
            <button onclick="setLang('en')" class="px-3 py-2 hover:bg-white/10 rounded text-left text-sm flex items-center gap-2">🇺🇸 English</button>
            <button onclick="setLang('fr')" class="px-3 py-2 hover:bg-white/10 rounded text-left text-sm flex items-center gap-2">🇫🇷 Français</button>
            <button onclick="setLang('de')" class="px-3 py-2 hover:bg-white/10 rounded text-left text-sm flex items-center gap-2">🇩🇪 Deutsch</button>
            <button onclick="setLang('it')" class="px-3 py-2 hover:bg-white/10 rounded text-left text-sm flex items-center gap-2">🇮🇹 Italiano</button>
            <button onclick="setLang('es')" class="px-3 py-2 hover:bg-white/10 rounded text-left text-sm flex items-center gap-2">🇪🇸 Español</button>
            <button onclick="setLang('ar')" class="px-3 py-2 hover:bg-white/10 rounded text-right text-sm flex items-center gap-2 justify-end">العربية 🇸🇦</button>
        </div>
        <button onclick="document.getElementById('lang-menu').classList.toggle('hidden')" class="h-12 w-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110 border border-blue-400">
            <i data-lucide="languages" class="w-6 h-6"></i>
        </button>
    </div>

    <div class="w-72 border-r border-slate-800 bg-slate-900 flex flex-col z-20 shrink-0">
        <div class="p-5 border-b border-slate-800 font-bold text-xl flex items-center gap-2 text-white cursor-pointer hover:text-blue-400 transition-colors" onclick="goHome()">
            <i data-lucide="globe" class="text-blue-500"></i> GeoNexus
        </div>
        
        <div class="flex-1 overflow-y-auto p-3 space-y-1">
            <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-2 mt-2" data-i18n="nav.explore">EXPLORE</div>
            
            <div onclick="goHome()" class="nav-item flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg cursor-pointer text-slate-300 hover:text-white transition-colors">
                <i data-lucide="home" class="w-4 h-4 text-blue-400"></i> <span data-i18n="nav.home">Home</span>
            </div>
            <div onclick="activateView('view-community')" class="nav-item flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg cursor-pointer text-slate-300 hover:text-white transition-colors">
                <i data-lucide="users" class="w-4 h-4 text-pink-400"></i> <span data-i18n="nav.community">Community</span>
            </div>
            
            <div class="my-4 border-t border-slate-800"></div>
            
            <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-2" data-i18n="nav.modules">MODULES</div>
            <div onclick="activateView('view-data')" class="nav-item flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg cursor-pointer text-slate-300 hover:text-white transition-colors">
                <i data-lucide="database" class="w-4 h-4 text-purple-400"></i> <span data-i18n="nav.data">Datasets</span>
            </div>
            <div onclick="activateView('view-tools')" class="nav-item flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg cursor-pointer text-slate-300 hover:text-white transition-colors">
                <i data-lucide="wrench" class="w-4 h-4 text-orange-400"></i> <span data-i18n="nav.tools">Toolbox</span>
            </div>
            <div onclick="activateView('view-cases')" class="nav-item flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg cursor-pointer text-slate-300 hover:text-white transition-colors">
                <i data-lucide="book-open" class="w-4 h-4 text-yellow-400"></i> <span data-i18n="nav.cases">Case Studies</span>
            </div>

            <div class="mt-6 pt-6 border-t border-slate-800">
                <div class="flex items-center justify-between px-2 mb-2">
                    <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest" data-i18n="nav.active">ACTIVE TASK</div>
                    <span id="task-badge" class="hidden bg-blue-600 text-[10px] px-1.5 rounded text-white font-mono">0</span>
                </div>
                
                <div id="active-task-container" class="space-y-2 px-1">
                    <div id="empty-task-state" class="text-xs text-slate-600 italic px-2 py-4 text-center border border-dashed border-slate-800 rounded">
                        <span data-i18n="cart.empty">No assets selected.</span>
                    </div>
                </div>

                <button id="btn-goto-sim" onclick="activateView('view-map')" class="hidden w-full mt-4 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20">
                    <i data-lucide="play" class="w-3 h-3"></i> <span data-i18n="btn.compose">COMPOSE & RUN</span>
                </button>
            </div>
        </div>
    </div>

    <div class="flex-1 relative bg-slate-950 flex flex-col overflow-hidden">
        
        <div id="view-home" class="view-section view-active w-full h-full p-8 overflow-y-auto custom-scroll">
            <div class="max-w-7xl mx-auto space-y-8">
                <div class="relative rounded-2xl bg-gradient-to-r from-blue-900 to-slate-900 p-10 border border-slate-700 overflow-hidden shadow-2xl">
                    <div class="relative z-10">
                        <div class="flex gap-2 mb-4">
                            <span class="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs font-bold border border-blue-500/30">v13.0 Release</span>
                            <span class="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-xs font-bold border border-purple-500/30">GeoMCP Protocol</span>
                        </div>
                        <h1 class="text-5xl font-bold text-white mb-4" data-i18n="home.title">Global GeoAI Hub</h1>
                        <p class="text-slate-300 max-w-xl text-lg" data-i18n="home.subtitle">The open platform for geospatial agents, models, and datasets.</p>
                    </div>
                    <i data-lucide="globe" class="absolute -right-10 -bottom-10 w-80 h-80 text-white/5 animate-pulse"></i>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="glass-panel rounded-xl p-6 hover:bg-slate-800/50 transition-colors">
                        <div class="flex justify-between items-center mb-5">
                            <h3 class="font-bold text-white flex items-center gap-2 text-lg"><i data-lucide="database" class="text-blue-400"></i> <span data-i18n="board.data">Trending Data</span></h3>
                        </div>
                        <div class="space-y-3">
                            <div class="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-blue-600/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-blue-500/30">
                                <span class="text-xl">🛰️</span>
                                <div class="flex-1">
                                    <div class="text-sm font-bold text-slate-200">Sentinel-2 L2A Mosaic</div>
                                    <div class="text-xs text-slate-500">ESA • 12k downloads • Raster</div>
                                </div>
                                <span class="text-xs font-mono text-green-400 bg-green-400/10 px-2 py-1 rounded">#1 Trending</span>
                            </div>
                            <div class="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-blue-600/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-blue-500/30">
                                <span class="text-xl">🏙️</span>
                                <div class="flex-1">
                                    <div class="text-sm font-bold text-slate-200">OpenBuildings v3 (Africa)</div>
                                    <div class="text-xs text-slate-500">Google Research • 8.5k downloads</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-blue-600/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-blue-500/30">
                                <span class="text-xl">🌧️</span>
                                <div class="flex-1">
                                    <div class="text-sm font-bold text-slate-200">ERA5-Land Hourly</div>
                                    <div class="text-xs text-slate-500">ECMWF • Climate Reanalysis</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="glass-panel rounded-xl p-6 hover:bg-slate-800/50 transition-colors">
                        <div class="flex justify-between items-center mb-5">
                            <h3 class="font-bold text-white flex items-center gap-2 text-lg"><i data-lucide="cpu" class="text-purple-400"></i> <span data-i18n="board.models">SOTA Models</span></h3>
                        </div>
                        <div class="space-y-3">
                            <div class="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-purple-600/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-purple-500/30">
                                <span class="text-xl">🔥</span>
                                <div class="flex-1">
                                    <div class="text-sm font-bold text-slate-200">Wildfire_Dynamics_v9</div>
                                    <div class="text-xs text-slate-500">GeoNexus Core • Physics-Informed</div>
                                </div>
                                <span class="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full">New</span>
                            </div>
                            <div class="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-purple-600/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-purple-500/30">
                                <span class="text-xl">🌊</span>
                                <div class="flex-1">
                                    <div class="text-sm font-bold text-slate-200">FloodGPT-Heavy</div>
                                    <div class="text-xs text-slate-500">Transformer • 2.4M Params</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-purple-600/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-purple-500/30">
                                <span class="text-xl">🌾</span>
                                <div class="flex-1">
                                    <div class="text-sm font-bold text-slate-200">CropYield-LSTM</div>
                                    <div class="text-xs text-slate-500">Time-series Forecasting</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="glass-panel rounded-xl p-6 hover:bg-slate-800/50 transition-colors">
                         <div class="flex justify-between items-center mb-5">
                            <h3 class="font-bold text-white flex items-center gap-2 text-lg"><i data-lucide="wrench" class="text-orange-400"></i> <span data-i18n="board.tools">Top Tools</span></h3>
                        </div>
                         <div class="space-y-3">
                            <div class="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-orange-600/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-orange-500/30">
                                <div class="w-8 h-8 bg-slate-700 rounded flex items-center justify-center font-bold text-white text-xs">Q</div>
                                <div class="flex-1">
                                    <div class="text-sm font-bold text-slate-200">QGIS Bridge v4</div>
                                    <div class="text-xs text-slate-500">Connector • 50k users</div>
                                </div>
                                <div class="flex gap-1 text-yellow-500 text-xs"><i data-lucide="star" class="w-3 h-3 fill-current"></i> 4.9</div>
                            </div>
                             <div class="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-orange-600/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-orange-500/30">
                                <div class="w-8 h-8 bg-blue-900/50 rounded flex items-center justify-center font-bold text-blue-400 text-xs">H</div>
                                <div class="flex-1">
                                    <div class="text-sm font-bold text-slate-200">HEC-RAS Agent</div>
                                    <div class="text-xs text-slate-500">Hydrology • USACE</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="glass-panel rounded-xl p-6 hover:bg-slate-800/50 transition-colors">
                         <div class="flex justify-between items-center mb-5">
                            <h3 class="font-bold text-white flex items-center gap-2 text-lg"><i data-lucide="newspaper" class="text-green-400"></i> <span data-i18n="board.news">SDG Insights</span></h3>
                        </div>
                        <div class="space-y-3">
                            <div class="p-3 bg-slate-900/50 rounded-xl border-l-2 border-green-500 cursor-pointer hover:bg-green-900/20 transition-colors">
                                <div class="text-xs text-green-400 font-bold mb-1">SDG 13: CLIMATE</div>
                                <div class="text-sm text-white font-medium">Monitoring Amazon deforestation with GeoAgents: 2025 Report</div>
                            </div>
                             <div class="p-3 bg-slate-900/50 rounded-xl border-l-2 border-yellow-500 cursor-pointer hover:bg-yellow-900/20 transition-colors">
                                <div class="text-xs text-yellow-400 font-bold mb-1">SDG 11: CITIES</div>
                                <div class="text-sm text-white font-medium">Urban heat island analysis in Southeast Asia</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="view-community" class="view-section w-full h-full p-8 overflow-y-auto bg-slate-950">
            <div class="max-w-5xl mx-auto">
                <div class="flex justify-between items-end mb-6">
                    <h2 class="text-2xl font-bold text-white flex items-center gap-2"><i data-lucide="message-circle" class="text-pink-400"></i> Community Discussion</h2>
                    <button class="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded-lg text-sm font-bold">New Post</button>
                </div>
                
                <div class="space-y-4">
                    <div class="glass p-5 rounded-xl hover:border-pink-500 border border-slate-700 cursor-pointer transition-colors">
                        <div class="flex gap-4">
                            <div class="flex flex-col items-center gap-1 text-slate-400 font-mono">
                                <i data-lucide="chevron-up" class="w-5 h-5 hover:text-orange-500"></i>
                                <span class="font-bold">248</span>
                            </div>
                            <div class="flex-1">
                                <h3 class="text-lg font-bold text-white mb-1">Optimization tips for FloodGPT on edge devices?</h3>
                                <p class="text-slate-400 text-sm mb-2">I'm deploying the model on a drone for real-time inference...</p>
                                <div class="flex gap-2 text-xs">
                                    <span class="bg-slate-800 text-blue-300 px-2 py-0.5 rounded">Technical</span>
                                    <span class="bg-slate-800 text-pink-300 px-2 py-0.5 rounded">Edge AI</span>
                                    <span class="text-slate-500 ml-auto">Posted by @geo_hacker • 1h ago</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="glass p-5 rounded-xl hover:border-pink-500 border border-slate-700 cursor-pointer transition-colors">
                        <div class="flex gap-4">
                            <div class="flex flex-col items-center gap-1 text-slate-400 font-mono">
                                <span class="font-bold">86</span>
                            </div>
                            <div class="flex-1">
                                <h3 class="text-lg font-bold text-white mb-1">Proposal for a unified metadata standard for citizen science data</h3>
                                <p class="text-slate-400 text-sm mb-2">Current GeoJSON extensions are insufficient for provenance tracking...</p>
                                <div class="flex gap-2 text-xs">
                                    <span class="bg-slate-800 text-green-300 px-2 py-0.5 rounded">Standard</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="glass p-5 rounded-xl hover:border-pink-500 border border-slate-700 cursor-pointer transition-colors">
                        <div class="flex gap-4">
                            <div class="flex flex-col items-center gap-1 text-slate-400 font-mono">
                                <span class="font-bold">42</span>
                            </div>
                            <div class="flex-1">
                                <h3 class="text-lg font-bold text-white mb-1">GeoNexus vs. Google Earth Engine for academic research?</h3>
                                <div class="flex gap-2 text-xs mt-2">
                                    <span class="bg-slate-800 text-yellow-300 px-2 py-0.5 rounded">Discussion</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="view-data" class="view-section w-full h-full bg-slate-950 p-10 overflow-y-auto">
            <h2 class="text-2xl font-bold text-white mb-2 flex items-center gap-2"><i data-lucide="database" class="text-blue-500"></i> Datasets</h2>
            <p class="text-slate-400 mb-6 text-sm">Select data for your analysis task.</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden group hover:border-blue-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                        <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-data-1" class="peer hidden" onchange="toggleAsset('data', 'Sentinel-1 SAR', '🛰️')">
                            <label for="chk-data-1" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-blue-500 peer-checked:bg-blue-600 peer-checked:border-blue-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">🛰️</span>
                            <h3 class="font-bold text-blue-400">Sentinel-1 SAR</h3>
                        </div>
                        <p class="text-slate-300 text-sm mb-4 min-h-[40px]">C-band Synthetic Aperture Radar imagery. Penetrates clouds for flood mapping.</p>
                        <div class="grid grid-cols-2 gap-y-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
                            <div>Provider: <span class="text-slate-200">ESA</span></div>
                            <div>Res: <span class="text-slate-200">10m</span></div>
                            <div>Format: <span class="text-slate-200">COG</span></div>
                            <div>Freq: <span class="text-slate-200">6 days</span></div>
                            <div class="col-span-2 flex items-center gap-1 mt-1 text-yellow-500">
                                <i data-lucide="star" class="w-3 h-3 fill-current"></i> 4.8 (2.3k reviews)
                            </div>
                        </div>
                    </div>
                </div>

                <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden group hover:border-blue-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                        <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-data-2" class="peer hidden" onchange="toggleAsset('data', 'WorldPop ZAF', '👥')">
                            <label for="chk-data-2" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-blue-500 peer-checked:bg-blue-600 peer-checked:border-blue-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">👥</span>
                            <h3 class="font-bold text-green-400">WorldPop Density</h3>
                        </div>
                        <p class="text-slate-300 text-sm mb-4 min-h-[40px]">High-res population counts (2025 est). Critical for exposure analysis.</p>
                        <div class="grid grid-cols-2 gap-y-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
                            <div>Provider: <span class="text-slate-200">U.Southampton</span></div>
                            <div>Res: <span class="text-slate-200">100m</span></div>
                        </div>
                    </div>
                </div>

                <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden group hover:border-blue-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                        <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-data-3" class="peer hidden" onchange="toggleAsset('data', 'HydroSHEDS River', '🌊')">
                            <label for="chk-data-3" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-blue-500 peer-checked:bg-blue-600 peer-checked:border-blue-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">🌊</span>
                            <h3 class="font-bold text-cyan-400">River Network</h3>
                        </div>
                        <p class="text-slate-300 text-sm mb-4 min-h-[40px]">Vectorized river channels and catchment boundaries.</p>
                         <div class="grid grid-cols-2 gap-y-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
                            <div>Provider: <span class="text-slate-200">WWF</span></div>
                            <div>Format: <span class="text-slate-200">GeoPackage</span></div>
                        </div>
                    </div>
                </div>
                
                 <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden group hover:border-blue-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                        <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-data-4" class="peer hidden" onchange="toggleAsset('data', 'MunichRe Risks', '🏦')">
                            <label for="chk-data-4" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-blue-500 peer-checked:bg-blue-600 peer-checked:border-blue-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">🏦</span>
                            <h3 class="font-bold text-yellow-400">Insurance Data</h3>
                        </div>
                        <p class="text-slate-300 text-sm mb-4 min-h-[40px]">Historical flood loss events and claim density heatmap.</p>
                        <div class="grid grid-cols-2 gap-y-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
                            <div>Provider: <span class="text-slate-200">MunichRe</span></div>
                            <div>Access: <span class="text-yellow-500">Restricted</span></div>
                        </div>
                    </div>
                </div>

                 <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden group hover:border-blue-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                         <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-data-5" class="peer hidden" onchange="toggleAsset('data', 'GPM IMERG', '🌧️')">
                            <label for="chk-data-5" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-blue-500 peer-checked:bg-blue-600 peer-checked:border-blue-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">🌧️</span>
                            <h3 class="font-bold text-blue-300">GPM Rainfall</h3>
                        </div>
                        <p class="text-slate-300 text-sm mb-4 min-h-[40px]">Global Precipitation Measurement. 30min latency.</p>
                         <div class="grid grid-cols-2 gap-y-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
                            <div>Provider: <span class="text-slate-200">NASA</span></div>
                            <div>Res: <span class="text-slate-200">0.1 deg</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="view-tools" class="view-section w-full h-full bg-slate-950 p-10 overflow-y-auto">
            <h2 class="text-2xl font-bold text-white mb-2 flex items-center gap-2"><i data-lucide="wrench" class="text-orange-500"></i> Toolbox</h2>
            <p class="text-slate-400 mb-6 text-sm">Select agents/models for the pipeline.</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden hover:border-orange-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                         <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-tool-1" class="peer hidden" onchange="toggleAsset('tool', 'Flood Mapper', '🌊')">
                            <label for="chk-tool-1" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-orange-500 peer-checked:bg-orange-600 peer-checked:border-orange-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">🌊</span>
                            <h3 class="font-bold text-white">Flood Mapper</h3>
                        </div>
                        <p class="text-slate-400 text-sm mb-4 min-h-[40px]">Thresholding SAR water masks + Terrain correction.</p>
                         <div class="space-y-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
                            <div class="flex justify-between"><span>Input:</span> <span class="text-blue-300">SAR, DEM</span></div>
                            <div class="flex justify-between"><span>Output:</span> <span class="text-green-300">Polygon</span></div>
                             <div class="flex justify-between"><span>Users:</span> <span class="text-slate-200">2.1k</span></div>
                        </div>
                    </div>
                </div>

                <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden hover:border-orange-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                         <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-tool-2" class="peer hidden" onchange="toggleAsset('tool', 'Exposure Calc', '🏘️')">
                            <label for="chk-tool-2" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-orange-500 peer-checked:bg-orange-600 peer-checked:border-orange-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">🏘️</span>
                            <h3 class="font-bold text-white">Exposure Calc</h3>
                        </div>
                        <p class="text-slate-400 text-sm mb-4 min-h-[40px]">Overlay flood masks with population/assets.</p>
                         <div class="space-y-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
                            <div class="flex justify-between"><span>Input:</span> <span class="text-blue-300">Mask, Pop</span></div>
                            <div class="flex justify-between"><span>Output:</span> <span class="text-green-300">Stats Table</span></div>
                        </div>
                    </div>
                </div>
                
                <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden hover:border-orange-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                         <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-tool-3" class="peer hidden" onchange="toggleAsset('tool', 'Loss Assessment', '💰')">
                            <label for="chk-tool-3" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-orange-500 peer-checked:bg-orange-600 peer-checked:border-orange-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">💰</span>
                            <h3 class="font-bold text-white">Loss Model</h3>
                        </div>
                        <p class="text-slate-400 text-sm mb-4 min-h-[40px]">Economic damage estimation based on depth-damage curves.</p>
                    </div>
                </div>

                <div class="glass p-0 rounded-xl border border-slate-700 overflow-hidden hover:border-orange-500 transition-all shadow-lg">
                    <div class="p-5 relative">
                         <div class="absolute top-4 right-4 z-10">
                            <input type="checkbox" id="chk-tool-4" class="peer hidden" onchange="toggleAsset('tool', 'Evacuation Route', '🚦')">
                            <label for="chk-tool-4" class="w-6 h-6 rounded border border-slate-500 bg-slate-900 flex items-center justify-center cursor-pointer hover:border-orange-500 peer-checked:bg-orange-600 peer-checked:border-orange-600 check-circle">
                                <i data-lucide="check" class="w-4 h-4 text-white opacity-0 peer-checked:opacity-100"></i>
                            </label>
                        </div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-2xl">🚦</span>
                            <h3 class="font-bold text-white">Evac Planner</h3>
                        </div>
                        <p class="text-slate-400 text-sm mb-4 min-h-[40px]">Agent-based routing on road networks.</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="view-map" class="view-section w-full h-full relative">
            <div id="map"></div>
            
            <div id="model-builder" class="absolute top-20 left-20 z-[500] glass-panel rounded-xl p-4 w-[600px] hidden shadow-2xl border border-slate-600">
                <div class="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
                    <h3 class="font-bold text-white flex items-center gap-2"><i data-lucide="workflow" class="text-green-400"></i> Workflow Orchestrator</h3>
                    <button onclick="document.getElementById('model-builder').classList.add('hidden')" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
                
                <div class="bg-slate-900/50 rounded-lg p-6 h-64 relative overflow-hidden" id="builder-canvas">
                    <div class="text-center text-slate-500 mt-20" id="builder-empty">Add assets from Data/Toolbox to build workflow</div>
                    
                    <div id="builder-nodes" class="hidden flex items-center justify-between h-full px-4 relative">
                        <svg class="absolute top-1/2 left-0 w-full h-10 -translate-y-1/2 z-0">
                            <line x1="10%" y1="50%" x2="50%" y2="50%" class="connector-line" />
                            <line x1="50%" y1="50%" x2="90%" y2="50%" class="connector-line" />
                        </svg>
                        <div class="z-10 bg-slate-800 border border-blue-500 p-3 rounded-lg flex flex-col items-center gap-2 w-28 shadow-lg">
                            <span class="text-xl">🛰️</span>
                            <span class="text-[10px] text-blue-300 font-bold">Sentinel-1</span>
                        </div>
                        <div class="z-10 bg-slate-800 border border-orange-500 p-3 rounded-lg flex flex-col items-center gap-2 w-28 shadow-lg">
                            <span class="text-xl">🌊</span>
                            <span class="text-[10px] text-orange-300 font-bold">Flood Agent</span>
                        </div>
                        <div class="z-10 bg-slate-800 border border-green-500 p-3 rounded-lg flex flex-col items-center gap-2 w-28 shadow-lg">
                            <span class="text-xl">🗺️</span>
                            <span class="text-[10px] text-green-300 font-bold">Risk Map</span>
                        </div>
                    </div>
                </div>
                
                <div class="mt-4 flex justify-end">
                    <button onclick="runModel()" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg hover:shadow-green-500/20 transition-all">
                        <i data-lucide="play" class="w-4 h-4"></i> EXECUTE WORKFLOW
                    </button>
                </div>
            </div>

            <div class="absolute top-4 left-4 z-[400] flex gap-2">
                 <button onclick="toggleBuilder()" class="glass px-3 py-1.5 rounded-lg text-xs font-mono text-white flex items-center gap-2 hover:bg-slate-800 transition-colors">
                    <i data-lucide="workflow"></i> BUILDER
                </button>
            </div>
        </div>
        
        <div id="view-cases" class="view-section w-full h-full bg-slate-950 p-10 overflow-y-auto">
            <h2 class="text-2xl font-bold text-white mb-6 flex items-center gap-2"><i data-lucide="book-open" class="text-yellow-500"></i> Case Studies</h2>
            <div class="grid grid-cols-2 gap-8">
                <div class="glass rounded-xl overflow-hidden group cursor-pointer border border-slate-700 hover:border-yellow-500 transition-all">
                    <div class="h-48 bg-slate-800 relative">
                        <div class="absolute inset-0 flex items-center justify-center text-4xl bg-black/20">🇿🇦</div>
                        <div class="absolute bottom-4 left-4 z-20">
                            <span class="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">Durban</span>
                        </div>
                    </div>
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-white mb-2 group-hover:text-yellow-500">Durban Floods 2022</h3>
                        <p class="text-slate-400 text-sm">Emergency response reference. Integrated social media signals.</p>
                    </div>
                </div>
                <div class="glass rounded-xl overflow-hidden group cursor-pointer border border-slate-700 hover:border-yellow-500 transition-all">
                    <div class="h-48 bg-slate-800 relative">
                        <div class="absolute inset-0 flex items-center justify-center text-4xl bg-black/20">🇱🇾</div>
                         <div class="absolute bottom-4 left-4 z-20">
                            <span class="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">Derna</span>
                        </div>
                    </div>
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-white mb-2 group-hover:text-yellow-500">Libya Derna Dam Collapse</h3>
                        <p class="text-slate-400 text-sm">Rapid damage assessment using high-res optical imagery.</p>
                    </div>
                </div>
                 <div class="glass rounded-xl overflow-hidden group cursor-pointer border border-slate-700 hover:border-yellow-500 transition-all">
                    <div class="h-48 bg-slate-800 relative">
                        <div class="absolute inset-0 flex items-center justify-center text-4xl bg-black/20">🇵🇰</div>
                    </div>
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-white mb-2 group-hover:text-yellow-500">Pakistan Monsoon 2022</h3>
                        <p class="text-slate-400 text-sm">Nationwide flood monitoring and agricultural loss estimation.</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="ai-panel" class="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] ai-initial glass shadow-2xl overflow-hidden flex flex-col">
            <div id="ai-input-mode" class="w-full h-full flex items-center px-4 gap-3">
                <div class="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center shrink-0">
                    <i data-lucide="sparkles" class="w-4 h-4 text-white"></i>
                </div>
                <input id="ai-input" type="text" placeholder="Ask GeoNexus..." class="bg-transparent border-none focus:outline-none text-white w-full text-sm placeholder-slate-400" onkeypress="handleAIEnter(event)">
            </div>
            
            <div id="ai-chat-mode" class="hidden flex-1 flex-col p-6">
                <div class="flex-1 overflow-y-auto space-y-4 mb-4">
                    <div class="flex justify-end">
                        <div class="bg-slate-700/50 text-white px-4 py-2 rounded-2xl rounded-tr-sm text-sm" data-i18n="chat.user">我想做南非的洪水风险制图</div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center shrink-0"><i data-lucide="bot" class="w-4 h-4 text-white"></i></div>
                        <div class="w-full">
                            <div class="text-slate-300 text-sm mb-3" data-i18n="chat.ai">I have orchestrated a workflow for <strong>South Africa Flood</strong>. Select module:</div>
                            <div class="grid grid-cols-2 gap-3">
                                <div onclick="handleCardClick('view-data')" class="bg-slate-800/80 hover:bg-blue-600/20 border border-slate-700 hover:border-blue-500 p-3 rounded-xl cursor-pointer transition-all">
                                    <div class="text-blue-400 font-bold text-xs mb-1 flex items-center gap-1"><i data-lucide="database" class="w-3 h-3"></i> DATASETS</div>
                                </div>
                                <div onclick="handleCardClick('view-tools')" class="bg-slate-800/80 hover:bg-orange-600/20 border border-slate-700 hover:border-orange-500 p-3 rounded-xl cursor-pointer transition-all">
                                    <div class="text-orange-400 font-bold text-xs mb-1 flex items-center gap-1"><i data-lucide="wrench" class="w-3 h-3"></i> TOOLBOX</div>
                                </div>
                                <div onclick="handleCardClick('view-map')" class="bg-slate-800/80 hover:bg-green-600/20 border border-slate-700 hover:border-green-500 p-3 rounded-xl cursor-pointer transition-all">
                                    <div class="text-green-400 font-bold text-xs mb-1 flex items-center gap-1"><i data-lucide="play" class="w-3 h-3"></i> SIMULATOR</div>
                                </div>
                                <div onclick="handleCardClick('view-cases')" class="bg-slate-800/80 hover:bg-yellow-600/20 border border-slate-700 hover:border-yellow-500 p-3 rounded-xl cursor-pointer transition-all">
                                    <div class="text-yellow-400 font-bold text-xs mb-1 flex items-center gap-1"><i data-lucide="book-open" class="w-3 h-3"></i> CASES</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="ai-task-mode" class="hidden w-full h-full flex items-center justify-between px-4 cursor-pointer" onclick="restoreAI()">
                 <div class="flex items-center gap-2 text-white text-sm font-bold"><span class="animate-pulse">●</span> Running: South Africa Flood</div>
            </div>
        </div>

    </div>

    <script>
        lucide.createIcons();
        
        // --- State ---
        let selectedAssets = [];

        // --- Map Init (South Africa) ---
        // 南非边界 (Simplified)
        var saBorder = [[-22, 30], [-25, 32], [-28, 32], [-28, 30], [-29, 29], [-31, 30], [-34, 25], [-34, 20], [-29, 16], [-28, 20], [-25, 20], [-22, 29], [-22, 30]];
        
        var map = L.map('map', { zoomControl: false }).setView([20, 0], 2);
        
        var layerGeoQ = L.tileLayer('https://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineCommunity/MapServer/tile/{z}/{y}/{x}', {attribution: 'GeoQ'});
        var layerOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: 'OSM'});
        var layerDark = L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {attribution: 'CartoDB'});

        layerDark.addTo(map);

        var baseMaps = {
            "Dark Matter": layerDark,
            "OpenStreetMap": layerOSM,
            "TianDiTu": layerGeoQ
        };
        L.control.layers(baseMaps).addTo(map);

        // --- Logic ---
        function activateView(viewId) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('view-active'));
            document.getElementById(viewId).classList.add('view-active');
            if(viewId === 'view-map') setTimeout(() => map.invalidateSize(), 100);
        }

        function goHome() { activateView('view-home'); resetAI(); }

        // 购物车逻辑
        function toggleAsset(type, name, icon) {
            const id = type + '-' + name;
            const existingIdx = selectedAssets.findIndex(a => a.id === id);
            
            if (existingIdx > -1) {
                selectedAssets.splice(existingIdx, 1);
            } else {
                selectedAssets.push({id, type, name, icon});
            }
            renderActiveTask();
        }

        function renderActiveTask() {
            const container = document.getElementById('active-task-container');
            const badge = document.getElementById('task-badge');
            const empty = document.getElementById('empty-task-state');
            const btn = document.getElementById('btn-goto-sim');
            
            container.innerHTML = '';
            
            if (selectedAssets.length === 0) {
                container.appendChild(empty);
                badge.classList.add('hidden');
                btn.classList.add('hidden');
                document.getElementById('builder-empty').classList.remove('hidden');
                document.getElementById('builder-nodes').classList.add('hidden');
            } else {
                badge.innerText = selectedAssets.length;
                badge.classList.remove('hidden');
                btn.classList.remove('hidden');
                document.getElementById('builder-empty').classList.add('hidden');
                document.getElementById('builder-nodes').classList.remove('hidden');

                selectedAssets.forEach(asset => {
                    const div = document.createElement('div');
                    div.className = "flex items-center gap-2 text-xs bg-slate-800 p-2 rounded border border-slate-700 animate-pulse";
                    div.innerHTML = `<span>${asset.icon}</span> <span class="text-slate-200 truncate">${asset.name}</span>`;
                    container.appendChild(div);
                });
            }
        }

        function toggleBuilder() {
            document.getElementById('model-builder').classList.remove('hidden');
        }

        function runModel() {
            document.getElementById('model-builder').classList.add('hidden');
            
            // Draw Flood Risk
            L.circle([-30.55, 22.93], {color: 'red', fillColor:'#f03', fillOpacity: 0.3, radius: 40000}).addTo(map)
             .bindPopup("<b>Simulation Result</b><br>Flood Risk: High").openPopup();
            
             map.flyTo([-30.55, 22.93], 7);
        }

        function handleAIEnter(e) {
            if(e.key === 'Enter') {
                document.getElementById('ai-panel').classList.add('ai-expanded');
                document.getElementById('ai-input-mode').classList.add('hidden');
                document.getElementById('ai-chat-mode').classList.remove('hidden');
            }
        }

        function handleCardClick(viewId) {
            activateView(viewId);
            const panel = document.getElementById('ai-panel');
            panel.classList.remove('ai-expanded');
            panel.classList.add('ai-minimized');
            document.getElementById('ai-chat-mode').classList.add('hidden');
            document.getElementById('ai-task-mode').classList.remove('hidden');

            if(viewId === 'view-map') {
                // Fly to SA and Draw Border
                map.flyTo([-29, 25], 5, {duration: 2});
                setTimeout(() => {
                    L.polygon(saBorder, {color: 'orange', fill: false, weight: 2}).addTo(map);
                    toggleBuilder();
                }, 2200);
            }
        }
        
        function restoreAI() {
            const panel = document.getElementById('ai-panel');
            panel.classList.remove('ai-minimized');
            panel.classList.add('ai-expanded');
            document.getElementById('ai-task-mode').classList.add('hidden');
            document.getElementById('ai-chat-mode').classList.remove('hidden');
        }

        function resetAI() {
            const panel = document.getElementById('ai-panel');
            panel.className = "absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] ai-initial glass shadow-2xl overflow-hidden flex flex-col";
            document.getElementById('ai-input-mode').classList.remove('hidden');
            document.getElementById('ai-chat-mode').classList.add('hidden');
            document.getElementById('ai-task-mode').classList.add('hidden');
            // Clear map layers (optional)
            map.eachLayer((layer) => { if(!layer._url) map.removeLayer(layer); }); 
        }

        // i18n
        const i18n = {
            zh: { "nav.home": "首页", "nav.community": "社区", "nav.data": "数据中心", "nav.tools": "工具箱", "nav.cases": "案例库", "home.title": "GeoAI 全球枢纽", "home.subtitle": "地理空间智能体与模型的开放平台。", "chat.user": "我想做南非的洪水风险制图", "chat.ai": "已为您编排工作流，请选择：" },
            en: { "nav.home": "Home", "nav.community": "Community", "nav.data": "Datasets", "nav.tools": "Toolbox", "nav.cases": "Case Studies", "home.title": "Global GeoAI Hub", "home.subtitle": "The open platform for geospatial agents.", "chat.user": "I want to map flood risk in South Africa", "chat.ai": "Workflow orchestrated. Select module:" },
            fr: { "nav.home": "Accueil", "home.title": "Hub GeoAI Mondial" },
            de: { "nav.home": "Startseite", "home.title": "Globaler GeoAI Hub" },
            it: { "nav.home": "Home", "home.title": "Hub GeoAI Globale" },
            es: { "nav.home": "Inicio", "home.title": "Centro GeoAI Global" },
            ar: { "nav.home": "الرئيسية", "home.title": "مركز GeoAI العالمي" }
        };

        function setLang(lang) {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if(i18n[lang][key]) el.innerText = i18n[lang][key];
            });
            document.getElementById('lang-menu').classList.add('hidden');
        }
    </script>
</body>
</html>
"""

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html_content)

print("✅ GeoNexus v13 终极交付版构建完成！")
PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler
try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Server at port {PORT}")
        print("👉 Open in Browser")
        httpd.serve_forever()
except OSError:
    print("⚠️ Port in use.")