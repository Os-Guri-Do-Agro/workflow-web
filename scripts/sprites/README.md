# Sprites do Nevo

Recorta a sprite sheet mestre do Nevo em arquivos individuais com fundo
transparente (`public/brand/nevo/*.webp`). O método está explicado no topo de
`nevo_sprites.py`.

```bash
python -m venv .venv
.venv/Scripts/pip install -r scripts/sprites/requirements.txt
.venv/Scripts/python scripts/sprites/nevo_sprites.py all --sheet C:/TRABALHO/workflow/sprites-nevo.png
```

- As caixas de cada sprite ficam em `crops.py`. Uma sheet nova exige caixas novas, e o `mask_full.png` em `.work/` ajuda a achar as coordenadas.
- Antes de publicar, confira `scripts/sprites/.work/contact.png`, que mostra cada sprite no fundo claro e no escuro, lado a lado.
- Depois de exportar, atualize `NEVO_SPRITES` em `src/components/nevo/nevo-assets.ts` com os tamanhos de `.work/manifest.json`.

## Próximas sheets

Para gerar uma sheet nova, use o personagem atual como referência e peça:

> "sprite sheet com 12 poses, cada sprite completamente separado, espaçamento amplo, fundo liso de uma cor só, sem texto, sem números e sem elementos sobrepostos"

Com fundo liso, o recorte sai quase perfeito. Se houver legenda embaixo do sprite, a caixa precisa ser cortada acima dela.
