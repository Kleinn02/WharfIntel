# app/pathfinder.py
import math
import heapq

WAYPOINTS = {
    # --- DAVAO & COASTAL ---
    "Panabo North Facility": (7.300, 125.650),
    "Central Cold Storage": (7.285, 125.660),
    "Export Processing Zone": (7.290, 125.711), 
    
    # 🔥 HIDDEN (Bypassed but not deleted)
    # "Road_Curve_1": (7.290, 125.658),
    "Road_Curve_2": (7.3055359841221605, 125.69270217888001),
    
    "DAVAO_PORT": (7.280809050622457, 125.78117904446286), 
    "WP_DAVAO_GULF_NORTH": (7.1564, 125.8261),
    "WP_DAVAO_GULF_SOUTH": (6.2639, 126.0582),
    "WP_SARANGANI": (5.480051708517015, 125.4203985794814), 
    
    # ⬛ THE BLACK LINE (Fastest Original Route)
    "WP_SULU_SEA_MAIN": (6.816, 122.071),
    "WP_SOUTH_CHINA_SEA_MAIN": (7.729, 115.622),

    # ⬜ THE WHITE LINE (Storm Backup Re-Route)
    "WP_CELEBES_SEA": (4.420, 119.748),
    "WP_SULU_SEA_SOUTH": (6.504, 119.339),
    "WP_SOUTH_CHINA_SEA_SOUTH": (7.264, 116.020),

    # 🟢 BRUNEI ROUTE
    "WP_BRUNEI_ROUTE_1": (5.283661220144332, 126.1749069606685),
    "WP_BRUNEI_ROUTE_2": (4.2505317267316345, 119.80174575667584),
    "WP_BRUNEI_ROUTE_3": (6.629528837053354, 119.4416184968612),
    "WP_BRUNEI_ROUTE_4": (7.257834136813624, 115.774868215112),

    # 🟢 THAILAND ROUTE
    "WP_THAILAND_ROUTE_1": (8.093718850944276, 104.5264903924251),
    "WP_THAILAND_ROUTE_2": (12.50935953658425, 100.44947697133357),

    # 🟢 JAKARTA ROUTE
    "WP_JAKARTA_ROUTE_1": (-0.07855881833110262, 118.43186797125963),
    "WP_JAKARTA_ROUTE_2": (-4.541806212623987, 116.31275401177173),

    # 🔥 DILI (TIMOR-LESTE) ROUTE (Untouched)
    "WP_DILI_ROUTE_1": (-2.4923567335826613, 126.78092398224993),
    "WP_DILI_ROUTE_2": (-3.0490864327791574, 125.38746524180281),

    # 🔥 MYANMAR (YANGON) ROUTE
    "WP_MYANMAR_ROUTE_1": (1.3062754616579304, 104.38764865598483),
    "WP_MYANMAR_ROUTE_2": (1.108672199810458, 103.55400779362982),
    "WP_MYANMAR_ROUTE_3": (6.981932008437812, 97.31916966730466),

    # --- OTHER GLOBAL NODES ---
    "WP_PHILIPPINE_SEA": (10.5, 127.5),
    "WP_NATUNA_SEA": (2.8498240889332624, 108.358125922074),       
    "WP_MAKASSAR_STRAIT": (-1.0, 118.5), 
    "WP_JAVA_SEA": (-4.5, 113.0),        
    "WP_MALACCA": (3.0, 101.0),

    # --- DESTINATIONS (COMPLETE 11-NATION ASEAN / SEA NETWORK) ---
    "Singapore": (1.290, 103.850),
    "Bangkok, Thailand": (13.756, 100.501),
    "Manila, Philippines": (14.599, 120.984),
    "Jakarta, Indonesia": (-6.208, 106.845),
    "Ho Chi Minh, Vietnam": (10.823, 106.629),
    "Yangon, Myanmar": (16.840, 96.145),
    "Muara, Brunei": (5.027, 115.064),
    "Dili, Timor-Leste": (-8.558, 125.573),
    "Port Klang, Malaysia": (2.999, 101.392),
    "Sihanoukville, Cambodia": (10.640, 103.520),
    "Vientiane, Laos": (17.975, 102.633)
}

# 🟢 GRAPH 1: STANDARD OPERATIONS (Strictly Fast / One-Way)
GRAPH = {
    "Panabo North Facility": ["Export Processing Zone"],
    "Central Cold Storage": ["Road_Curve_2"],
    "Road_Curve_2": ["Export Processing Zone"],
    "Export Processing Zone": ["DAVAO_PORT"],
    "DAVAO_PORT": ["WP_DAVAO_GULF_NORTH", "WP_PHILIPPINE_SEA"],
    "WP_DAVAO_GULF_NORTH": ["WP_DAVAO_GULF_SOUTH"],
    "WP_DAVAO_GULF_SOUTH": ["WP_SARANGANI"],
    "WP_PHILIPPINE_SEA": ["Manila, Philippines"],

    # 🔥 DILI: Maintained your custom connection point
    "WP_SARANGANI": ["WP_SULU_SEA_MAIN", "WP_JAKARTA_ROUTE_1"], 
    "WP_JAKARTA_ROUTE_1": ["WP_MAKASSAR_STRAIT", "WP_DILI_ROUTE_1"],
    
    "WP_SULU_SEA_MAIN": ["WP_SOUTH_CHINA_SEA_MAIN", "Manila, Philippines"],
    
    # 🔥 FIX: Re-added WP_NATUNA_SEA and Sihanoukville to the South China Sea!
    "WP_SOUTH_CHINA_SEA_MAIN": ["Ho Chi Minh, Vietnam", "Sihanoukville, Cambodia", "WP_THAILAND_ROUTE_1", "Muara, Brunei", "WP_NATUNA_SEA"],

    # THAILAND, CAMBODIA & LAOS CORRIDORS
    "WP_THAILAND_ROUTE_1": ["WP_THAILAND_ROUTE_2", "Sihanoukville, Cambodia"],
    "WP_THAILAND_ROUTE_2": ["Bangkok, Thailand"],
    "Bangkok, Thailand": ["Vientiane, Laos"],

    # JAKARTA
    "WP_MAKASSAR_STRAIT": ["WP_JAKARTA_ROUTE_2"],
    "WP_JAKARTA_ROUTE_2": ["WP_JAVA_SEA"],
    "WP_JAVA_SEA": ["Jakarta, Indonesia"],

    # DILI
    "WP_DILI_ROUTE_1": ["WP_DILI_ROUTE_2"],
    "WP_DILI_ROUTE_2": ["Dili, Timor-Leste"],

    # MYANMAR, MALAYSIA & SINGAPORE WIRING
    "WP_NATUNA_SEA": ["WP_MYANMAR_ROUTE_1", "Singapore"],
    "WP_MYANMAR_ROUTE_1": ["WP_MYANMAR_ROUTE_2"],
    "WP_MYANMAR_ROUTE_2": ["WP_MALACCA"],
    "WP_MALACCA": ["Singapore", "Port Klang, Malaysia", "WP_MYANMAR_ROUTE_3"],
    "WP_MYANMAR_ROUTE_3": ["Yangon, Myanmar"]
}

# 🔴 GRAPH 2: REROUTE FAILOVER OPERATIONS (Bi-Directional Escape Matrix)
REROUTE_GRAPH = {
    "Panabo North Facility": ["Export Processing Zone"],
    "Central Cold Storage": ["Road_Curve_2"],
    "Road_Curve_2": ["Export Processing Zone"],
    "Export Processing Zone": ["DAVAO_PORT"],
    
    "DAVAO_PORT": ["WP_DAVAO_GULF_NORTH", "WP_PHILIPPINE_SEA"],
    "WP_DAVAO_GULF_NORTH": ["WP_DAVAO_GULF_SOUTH", "DAVAO_PORT"],
    "WP_DAVAO_GULF_SOUTH": ["WP_SARANGANI", "WP_DAVAO_GULF_NORTH", "WP_BRUNEI_ROUTE_1"], 
    
    "WP_PHILIPPINE_SEA": ["Manila, Philippines"],
    "Manila, Philippines": ["WP_SOUTH_CHINA_SEA_MAIN"], 

    # 🔥 DILI: Maintained your custom connection point in the Reroute graph
    "WP_SARANGANI": ["WP_CELEBES_SEA", "WP_JAKARTA_ROUTE_1", "WP_DAVAO_GULF_SOUTH", "WP_SULU_SEA_MAIN", "WP_BRUNEI_ROUTE_1"], 
    "WP_JAKARTA_ROUTE_1": ["WP_MAKASSAR_STRAIT", "WP_SARANGANI", "WP_DILI_ROUTE_1"],
    
    "WP_SULU_SEA_MAIN": ["WP_SOUTH_CHINA_SEA_MAIN", "Manila, Philippines", "WP_SARANGANI"],
    
    # 🔥 FIX: Re-added WP_NATUNA_SEA and Sihanoukville so U-Turns work across ASEAN
    "WP_SOUTH_CHINA_SEA_MAIN": ["Ho Chi Minh, Vietnam", "Sihanoukville, Cambodia", "WP_THAILAND_ROUTE_1", "Muara, Brunei", "WP_NATUNA_SEA", "WP_SULU_SEA_MAIN"],

    "WP_CELEBES_SEA": ["WP_SULU_SEA_SOUTH", "WP_SARANGANI"],
    "WP_SULU_SEA_SOUTH": ["WP_SOUTH_CHINA_SEA_SOUTH", "Muara, Brunei", "WP_CELEBES_SEA"],
    "WP_SOUTH_CHINA_SEA_SOUTH": ["Ho Chi Minh, Vietnam", "Sihanoukville, Cambodia", "WP_THAILAND_ROUTE_1", "Muara, Brunei", "WP_NATUNA_SEA", "WP_SULU_SEA_SOUTH"],

    "WP_BRUNEI_ROUTE_1": ["WP_BRUNEI_ROUTE_2", "WP_SARANGANI"],
    "WP_BRUNEI_ROUTE_2": ["WP_BRUNEI_ROUTE_3", "WP_BRUNEI_ROUTE_1"],
    "WP_BRUNEI_ROUTE_3": ["WP_BRUNEI_ROUTE_4", "WP_BRUNEI_ROUTE_2"],
    "WP_BRUNEI_ROUTE_4": ["Muara, Brunei", "WP_BRUNEI_ROUTE_3"],

    "WP_THAILAND_ROUTE_1": ["WP_THAILAND_ROUTE_2", "Sihanoukville, Cambodia", "WP_SOUTH_CHINA_SEA_MAIN", "WP_SOUTH_CHINA_SEA_SOUTH"],
    "WP_THAILAND_ROUTE_2": ["Bangkok, Thailand", "WP_THAILAND_ROUTE_1"],
    "Bangkok, Thailand": ["Vientiane, Laos", "WP_THAILAND_ROUTE_2"],
    "Sihanoukville, Cambodia": ["WP_THAILAND_ROUTE_1", "WP_SOUTH_CHINA_SEA_MAIN"],
    "Vientiane, Laos": ["Bangkok, Thailand"],

    "WP_MAKASSAR_STRAIT": ["WP_JAKARTA_ROUTE_2", "WP_JAKARTA_ROUTE_1"],
    "WP_JAKARTA_ROUTE_2": ["WP_JAVA_SEA", "WP_MAKASSAR_STRAIT"],
    "WP_JAVA_SEA": ["Jakarta, Indonesia", "WP_JAKARTA_ROUTE_2"],

    "WP_DILI_ROUTE_1": ["WP_DILI_ROUTE_2", "WP_JAKARTA_ROUTE_1"],
    "WP_DILI_ROUTE_2": ["Dili, Timor-Leste", "WP_DILI_ROUTE_1"],

    # 🔥 FIX: Wired the Natuna Sea and Malacca Strait for bi-directional Myanmar & Malaysia routing
    "WP_NATUNA_SEA": ["WP_MYANMAR_ROUTE_1", "Singapore", "WP_SOUTH_CHINA_SEA_MAIN", "WP_SOUTH_CHINA_SEA_SOUTH"],
    "WP_MYANMAR_ROUTE_1": ["WP_MYANMAR_ROUTE_2", "WP_NATUNA_SEA"],
    "WP_MYANMAR_ROUTE_2": ["WP_MALACCA", "WP_MYANMAR_ROUTE_1"],
    "WP_MALACCA": ["Singapore", "Port Klang, Malaysia", "WP_MYANMAR_ROUTE_3", "WP_MYANMAR_ROUTE_2"],
    "Port Klang, Malaysia": ["WP_MALACCA"],
    "WP_MYANMAR_ROUTE_3": ["Yangon, Myanmar", "WP_MALACCA"]
}

def haversine(coord1, coord2):
    return math.sqrt((coord1[0] - coord2[0])**2 + (coord1[1] - coord2[1])**2)

def a_star_route(start_node, target_node, avoid_nodes=None, use_reroute_graph=False):
    if avoid_nodes is None:
        avoid_nodes = []
        
    if target_node not in WAYPOINTS: 
        return [WAYPOINTS.get(start_node, (0,0)), (0,0)] 
        
    queue = [(0, 0, start_node, [])]
    seen = set()
    
    active_graph = REROUTE_GRAPH if use_reroute_graph else GRAPH
    
    while queue:
        (f_cost, g_cost, current, path) = heapq.heappop(queue)
        if current in seen: continue
        seen.add(current)
        path = path + [WAYPOINTS[current]]
        
        if current == target_node: return path
            
        for next_node in active_graph.get(current, []):
            if next_node in seen or (next_node in avoid_nodes and next_node != target_node): 
                continue
            
            new_g_cost = g_cost + haversine(WAYPOINTS[current], WAYPOINTS[next_node])
            new_f_cost = new_g_cost + haversine(WAYPOINTS[next_node], WAYPOINTS[target_node])
            
            heapq.heappush(queue, (new_f_cost, new_g_cost, next_node, path))
            
    return [WAYPOINTS.get(start_node, (0,0)), WAYPOINTS[target_node]]