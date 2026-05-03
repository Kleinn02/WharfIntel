# pathfinder.py
import math

# 1. NAVIGABLE NODES (Deep water coordinates)
SEA_NODES = {
    "DAVAO_PORT": (7.13, 125.65),
    "GULF_EXIT": (6.50, 126.00),
    "PHILIPPINE_SEA_HUB": (10.00, 127.50),
    "SURIGAO_STRAIT": (10.30, 125.40),
    "LUZON_STRAIT": (20.00, 121.00),
    "TAIPEI_PORT": (25.13, 121.74),
    "TOKYO_BAY": (35.68, 139.76),
    "BUSAN_PORT": (35.17, 129.07),
    "SINGAPORE_STRAIT": (1.29, 103.85),
    "MANILA_BAY": (14.59, 120.98)
}

# 2. VALID SEA LANES (Prevents island clipping)
NAUTICAL_GRAPH = {
    "DAVAO_PORT": ["GULF_EXIT"],
    "GULF_EXIT": ["DAVAO_PORT", "PHILIPPINE_SEA_HUB"],
    "PHILIPPINE_SEA_HUB": ["GULF_EXIT", "SURIGAO_STRAIT", "LUZON_STRAIT"],
    "SURIGAO_STRAIT": ["PHILIPPINE_SEA_HUB", "MANILA_BAY"],
    "LUZON_STRAIT": ["PHILIPPINE_SEA_HUB", "MANILA_BAY", "TAIPEI_PORT"],
    "TAIPEI_PORT": ["LUZON_STRAIT", "BUSAN_PORT", "TOKYO_BAY"],
    "BUSAN_PORT": ["TAIPEI_PORT", "TOKYO_BAY"],
    "TOKYO_BAY": ["TAIPEI_PORT", "BUSAN_PORT"],
    "MANILA_BAY": ["SURIGAO_STRAIT", "LUZON_STRAIT", "SINGAPORE_STRAIT"],
    "SINGAPORE_STRAIT": ["MANILA_BAY"]
}

# 3. MAPPING UI NAMES TO NODES
DESTINATION_MAP = {
    "Tokyo, Japan": "TOKYO_BAY",
    "Busan, South Korea": "BUSAN_PORT",
    "Taipei, Taiwan": "TAIPEI_PORT",
    "Singapore": "SINGAPORE_STRAIT",
    "Manila, Philippines": "MANILA_BAY",
    "Panabo Wharf": "DAVAO_PORT",
    "Davao City Port": "DAVAO_PORT",
    "Cebu Port": "SURIGAO_STRAIT",
    "Batangas Terminal": "MANILA_BAY"
}

def plot_smart_course(origin_node, destination_name):
    """BFS Pathfinding to find safe waypoints."""
    start_node = origin_node
    end_node = DESTINATION_MAP.get(destination_name, "MANILA_BAY")
    
    queue = [(start_node, [SEA_NODES[start_node]])]
    visited = set()

    while queue:
        (current, path) = queue.pop(0)
        if current not in visited:
            if current == end_node:
                return path
            visited.add(current)
            for neighbor in NAUTICAL_GRAPH.get(current, []):
                new_path = list(path)
                new_path.append(SEA_NODES[neighbor])
                queue.append((neighbor, new_path))
                
    return [SEA_NODES["DAVAO_PORT"], SEA_NODES[end_node]]