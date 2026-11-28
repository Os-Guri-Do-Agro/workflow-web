# nome: (x, y, w, h, cap_bottom)
R1, R2, RF, RU = 266, 478, 727, 929
CROPS = {
 # poses principais
 "idle": (26,94,142,159,R1), "walk-1": (184,96,123,156,R1), "walk-2": (326,104,131,150,R1),
 "run-1": (487,96,122,161,R1), "run-2": (623,104,123,153,R1), "jump": (748,60,129,170,R1),
 "happy": (894,92,137,162,R1), "victory": (1046,73,151,161,R1), "thinking": (1210,92,134,163,R1),
 "sad": (1390,101,108,156,R1),
 "motivado": (14,300,158,162,R2), "cansado": (195,323,107,138,R2), "comemorando": (312,296,165,175,R2),
 "segurando-bebida": (488,319,123,142,R2), "dando-dica": (638,303,137,163,R2), "com-raiva": (790,318,132,148,R2),
 "confuso": (938,313,106,154,R2), "dormindo": (1084,322,142,148,R2),
 "olhar-esquerda": (1262,320,102,143,R2), "olhar-direita": (1402,321,101,143,R2),
 # fogo
 "fogo-normal": (34,627,69,88,RF), "fogo-animado-1": (143,608,88,112,RF), "fogo-animado-2": (262,612,86,108,RF),
 "fogo-animado-3": (384,600,80,120,RF), "fogo-brilho": (505,606,81,114,RF), "fogo-particulas": (612,606,106,116,RF),
 "fogo-grande": (751,578,93,138,RF), "fogo-aura": (862,588,116,138,RF),
 # ícones de sequência (tiers)
 "seq-basico": (1030,619,77,95,RF), "seq-constancia": (1130,619,76,95,RF), "seq-disciplina": (1229,618,77,96,RF),
 "seq-avancado": (1330,614,77,99,RF), "seq-lendario": (1424,608,85,106,RF),
 # UI
 "ui-check": (30,858,58,59,RU), "ui-check-vazio": (94,858,58,59,RU), "ui-progresso": (159,859,57,58,RU),
 "ui-estrela": (224,859,58,58,RU), "ui-alvo": (290,859,56,58,RU), "ui-xicara": (358,858,64,60,RU),
 # expressões
 "exp-sorriso": (456,836,90,90,RU), "exp-piscar": (548,837,89,89,RU), "exp-surpreso": (646,837,88,91,RU),
 "exp-triste": (734,837,87,90,RU), "exp-com-fome": (818,835,88,94,RU), "exp-bravo": (902,838,85,90,RU),
 # extras
 "extra-respingo": (1030,854,72,72,934), "extra-confete": (1124,852,72,62,934), "extra-ideia": (1222,858,49,64,934),
 "extra-duvida": (1296,851,44,69,934), "extra-coracao": (1354,860,54,48,934), "extra-capa": (1416,850,70,82,934),
}
