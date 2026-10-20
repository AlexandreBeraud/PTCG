#!/usr/bin/env python3
"""Change les ports de PTCG dans le Caddyfile et le docker-compose du hub.

    python3 bascule_caddy.py ~/hub aller    nouvelle appli sur 8083 (et 8085), ancienne sur 8999
    python3 bascule_caddy.py ~/hub retour   ancienne appli sur 8083, nouvelle sur 8085

Les fichiers sont réécrits en place (même inode : le conteneur Caddy voit la
modification) ; à l'aller, une copie .avant-bascule garde l'état d'avant.
"""
import re
import shutil
import sys
from pathlib import Path


def site_lines(lines):
    # lignes d'adresse de site : au premier niveau et ouvrant un bloc
    return [i for i, l in enumerate(lines) if l and not l[0].isspace() and l.rstrip().endswith('{') and not l.startswith('(')]


def addresses(line):
    return [a.strip() for a in line.rstrip()[:-1].split(',') if a.strip()]


def with_port(addrs, port):
    return any(re.search(rf':{port}$', a) for a in addrs)


def write(path, text, backup=True):
    # copie de l'état d'avant, pour remettre la config si Caddy la refuse
    if backup:
        shutil.copy2(path, path.with_name(path.name + '.avant-bascule'))
    with open(path, 'w') as f:  # même fichier, même inode
        f.write(text)


def caddy(path, direction):
    lines = path.read_text().split('\n')
    sites = site_lines(lines)
    by_port = lambda p: [i for i in sites if with_port(addresses(lines[i]), p)]

    if direction == 'aller':
        v2 = by_port('8085')
        if len(v2) != 1:
            raise SystemExit('Caddyfile : bloc :8085 (nouvelle appli) introuvable ou en double')
        if with_port(addresses(lines[v2[0]]), '8083'):
            print('Caddyfile : déjà basculé')
            return False
        old = [i for i in by_port('8083') if i != v2[0]]
        if len(old) != 1:
            raise SystemExit('Caddyfile : bloc :8083 (ancienne appli) introuvable ou en double')
        if by_port('8999'):
            raise SystemExit('Caddyfile : le port 8999 est déjà utilisé par un autre site')
        lines[old[0]] = re.sub(r':8083(?=\s*[,{])', ':8999', lines[old[0]])
        lines[v2[0]] = re.sub(r'^(\s*)', r'\1:8083, ', lines[v2[0]], count=1)
    else:
        v2 = [i for i in by_port('8085') if with_port(addresses(lines[i]), '8083')]
        if not v2:
            print('Caddyfile : la nouvelle appli n\'est pas sur 8083, rien à défaire')
            return False
        old = by_port('8999')
        if len(old) != 1:
            raise SystemExit('Caddyfile : bloc :8999 (ancienne appli) introuvable')
        addrs = [a for a in addresses(lines[v2[0]]) if not re.search(r':8083$', a)]
        lines[v2[0]] = ', '.join(addrs) + ' {'
        lines[old[0]] = re.sub(r':8999(?=\s*[,{])', ':8083', lines[old[0]])

    write(path, '\n'.join(lines), backup=direction == 'aller')
    for i in sites:
        print('  ' + lines[i].strip())
    return True


def compose(path, direction):
    text = path.read_text()
    if direction == 'retour' or '8999' in text:
        return False  # garder le port 8999 ouvert ne gêne pas
    lines = text.split('\n')
    hits = [i for i, l in enumerate(lines) if re.search(r'["\']?8083:8083["\']?', l)]
    if not hits:
        if 'network_mode: host' in text or 'network_mode: "host"' in text:
            return False
        raise SystemExit('docker-compose : publication du port 8083 introuvable, ajoute 8999:8999 à la main')
    i = hits[0]
    lines.insert(i + 1, lines[i].replace('8083:8083', '8999:8999'))
    write(path, '\n'.join(lines))
    print('  docker-compose : port 8999 publié')
    return True


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[2] not in ('aller', 'retour'):
        raise SystemExit(__doc__)
    hub = Path(sys.argv[1]).expanduser()
    caddy(hub / 'Caddyfile', sys.argv[2])
    compose(hub / 'docker-compose.yml', sys.argv[2])
