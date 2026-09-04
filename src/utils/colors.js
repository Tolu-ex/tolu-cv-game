// Central color palette so every world stays visually coherent.

export const PALETTE = {
  nature: {
    // Poster palette. Two things matter more than hue: the scene must read
    // COOL (pale blue dominant, not green), and it needs real value
    // separation — dark conifers against a pale sky is what gives a flat
    // illustration its crispness. An all-mid-tone scene reads as mush.
    ground: 0xbcc9ae,       // pale sage, not grass green
    groundDark: 0xa9b89c,
    sky: 0xd8e8f1,          // pale powder blue
    fog: 0xd8e8f1,          // matches sky so distance dissolves into it
    treeLeaf: 0x40614f,     // deep cool green, well below the ground in value
    treeLeafLight: 0x577a61,
    path: 0xece5d6,         // warm ivory against the cool field
  },
  haarlem: {
    sky: 0xaebfce,
    fog: 0xc4d3df,
    cobble: 0x9aa0a6,
    canal: 0x5c8fa3,
    brick: 0xb5502e,
    brickAlt: 0x8c3a24,
    cream: 0xe9dfc4,
    blue: 0x3d5a73,
    roofSlate: 0x394650,
    windmillBody: 0xd9c9a3,
    windmillCap: 0x5b4636,
  },
  // Obafemi Awolowo University, Ile-Ife: a landscaped modernist campus, so the
  // ground is lawn and paving rather than bare earth, and the sky is ordinary
  // tropical blue rather than the permanent amber that gets reached for
  // whenever the setting is African.
  ileife: {
    sky: 0xa8d6ee,
    fog: 0xc6e2f2,
    lawn: 0x5f9e4a,
    lawnDark: 0x4f8a3d,
    paving: 0xcfc9bb,
    road: 0x54585c,
    concrete: 0xe6e2d7,       // the campus's pale board-marked concrete
    concreteShade: 0xc4bfae,  // recesses behind the sun screens
    canopy: 0x357a3c,         // broad shade trees, which the campus is full of
  },
  lagos: {
    sky: 0xbcd4e6,
    fog: 0xc9dbe8,
    lagoon: 0x3f7fa0,
    plaza: 0x8f8f8f,
    skyline: [0xd8d8d8, 0xc2c9d1, 0xa9b6c4, 0xe3ddd0, 0x9fb0c0],
    stallRoof: 0xd94f3d,
    market: 0xe0a83f,
  },
  market: {
    sky: 0x151a33,
    fog: 0x232842,
    asphalt: 0x44475a,
    stall: 0x4a5066,
    neonPink: 0xff2fb0,
    neonCyan: 0x2ff3ff,
    neonYellow: 0xffe22f,
    sneakerColors: [0xff5252, 0x42e29a, 0xffd23f, 0x5c8fff, 0xff8a3d, 0xffffff],
  },
  singapore: {
    sky: 0x0a1330,
    fog: 0x131c3d,
    water: 0x0e2a4a,
    boardwalk: 0x2e2f3a,
    tower: 0x8a94a6,
    towerGlow: 0xfff2b0,
    supertreeCanopy: 0x2fae6a,
    starlight: 0xffffff,
  },
  contact: {
    sky: 0xffb677,
    fog: 0xffc794,
    field: 0x3f8f3f,
    tulipColors: [0xe5395a, 0xffd23f, 0xb84fd8, 0xff7a3d, 0xffffff, 0xff5cad],
    windmillBody: 0xe9dfc4,
    windmillCap: 0x6b4a35,
  },
  portal: {
    haarlem: 0xff8a3d,
    ileife: 0x2fae6a,
    lagos: 0x3fb0ff,
    market: 0xff2fb0,
    singapore: 0x2ff3ff,
    contact: 0xffd23f,
    // Green rather than white so the return-portal blip never reads as the
    // white player arrow on the radar (and it suits "back to nature").
    exit: 0x9dff5c,
  },
};
