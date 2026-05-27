# pathfinder.py
import math

# 1. NAVIGABLE NODES (Deep water + New SE Asia Nodes)
SEA_NODES = {
    "DAVAO_PORT": (7.13, 125.65),
    "GULF_EXIT": (6.50, 126.00),
    "PHILIPPINE_SEA_HUB": (10.00, 127.50),
    "SURIGAO_STRAIT": (10.30, 125.40),
    "SIBUYAN_SEA": (12.50, 122.50),           
    "VERDE_ISLAND_PASSAGE": (13.55, 120.90),  
    "LUZON_STRAIT": (20.00, 121.00),
    "WEST_PHIL_SEA": (14.00, 118.00),         
    "PALAWAN_PASSAGE": (10.00, 116.00),       
    "TAIPEI_PORT": (25.13, 121.74),
    "TOKYO_BAY": (35.68, 139.76),
    "BUSAN_PORT": (35.17, 129.07),
    "SINGAPORE_STRAIT": (1.29, 103.85),
    "MANILA_BAY": (14.59, 120.98),
    # 🔥 NEW SE ASIA NODES
    "MEKONG_DELTA": (10.34, 107.08),  # Vietnam
    "GULF_OF_THAILAND": (12.50, 101.00), # Thailand
    "JAVA_SEA": (-5.00, 107.00) # Indonesia
}

# 2. VALID SEA LANES 
NAUTICAL_GRAPH = {
    "DAVAO_PORT": ["GULF_EXIT"],
    "GULF_EXIT": ["DAVAO_PORT", "PHILIPPINE_SEA_HUB"],
    "PHILIPPINE_SEA_HUB": ["GULF_EXIT", "SURIGAO_STRAIT", "LUZON_STRAIT"],
    "SURIGAO_STRAIT": ["PHILIPPINE_SEA_HUB", "SIBUYAN_SEA"],
    "SIBUYAN_SEA": ["SURIGAO_STRAIT", "VERDE_ISLAND_PASSAGE"],
    "VERDE_ISLAND_PASSAGE": ["SIBUYAN_SEA", "MANILA_BAY", "WEST_PHIL_SEA"],
    "MANILA_BAY": ["VERDE_ISLAND_PASSAGE", "WEST_PHIL_SEA"],
    "WEST_PHIL_SEA": ["VERDE_ISLAND_PASSAGE", "MANILA_BAY", "LUZON_STRAIT", "PALAWAN_PASSAGE", "MEKONG_DELTA"],
    "PALAWAN_PASSAGE": ["WEST_PHIL_SEA", "SINGAPORE_STRAIT", "GULF_OF_THAILAND"],
    "LUZON_STRAIT": ["PHILIPPINE_SEA_HUB", "WEST_PHIL_SEA", "TAIPEI_PORT"],
    "TAIPEI_PORT": ["LUZON_STRAIT", "BUSAN_PORT", "TOKYO_BAY"],
    "BUSAN_PORT": ["TAIPEI_PORT", "TOKYO_BAY"],
    "TOKYO_BAY": ["TAIPEI_PORT", "BUSAN_PORT"],
    "SINGAPORE_STRAIT": ["PALAWAN_PASSAGE", "JAVA_SEA"],
    "MEKONG_DELTA": ["WEST_PHIL_SEA", "GULF_OF_THAILAND"],
    "GULF_OF_THAILAND": ["MEKONG_DELTA", "PALAWAN_PASSAGE"],
    "JAVA_SEA": ["SINGAPORE_STRAIT"]
}

# 3. MAPPING UI NAMES TO INLAND FINAL DESTINATIONS
# This ensures the green line actually hits the land market!
DESTINATION_MAP = {
    "Tokyo, Japan": "TOKYO_BAY",
    "Busan, South Korea": "BUSAN_PORT",
    "Taipei, Taiwan": "TAIPEI_PORT",
    "Singapore": "SINGAPORE_STRAIT",
    "Manila, Philippines": "MANILA_BAY",
    "Ho Chi Minh, Vietnam": "MEKONG_DELTA",
    "Bangkok, Thailand": "GULF_OF_THAILAND",
    "Jakarta, Indonesia": "JAVA_SEA"
}

def plot_smart_course(origin_node, destination_name):
    start_node = origin_node
    end_node = DESTINATION_MAP.get(destination_name, "MANILA_BAY")
    
    queue = [(start_node, [SEA_NODES[start_node]])]
    visited = set()

    while queue:
        (current, path) = queue.pop(0)
        if current not in visited:
            if current == end_node:
                # Add a slight inland offset to the final node so the green truck line shows up on land
                final_coord = list(path[-1])
                final_coord[0] += 0.05 # Move slightly North into the land
                final_coord[1] -= 0.05 # Move slightly West into the land
                path.append(tuple(final_coord))
                return path
            visited.add(current)
            for neighbor in NAUTICAL_GRAPH.get(current, []):
                new_path = list(path)
                new_path.append(SEA_NODES[neighbor])
                queue.append((neighbor, new_path))
                
    return [SEA_NODES["DAVAO_PORT"], SEA_NODES[end_node]]