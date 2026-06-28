def run_parse_megamenu(megamenu, category=None):
    """
    Recibe el JSON completo del endpoint megamenu
    Devuelve una lista plana jerárquica con:
        level, path, name, url, count
    """

    if "megaMenu" not in megamenu:
        raise ValueError("Invalid megamenu payload: 'megaMenu' key not found")

    flat_categories = []

    def traverse(node, current_path, level):
        name = node.get("name")
        url = node.get("url")
        count = node.get("count", 0)

        if not name or not url:
            return

        new_path = current_path + [name]

        flat_categories.append({
            "level": level,
            "path": new_path,
            "name": name,
            "url": url,
            "count": count
        })

        children = node.get("children", [])
        if children:
            for child in children:
                traverse(child, new_path, level + 1)

    for root_node in megamenu["megaMenu"]:
        if category is None or (root_node['url'] == f'/{category}.html'):
          traverse(root_node, [], 1)

    return flat_categories
