// 关卡 JSON 的排版：每个房间、每件东西各占一行，方便人读和看 diff。
module.exports = function fmt(d) {
  const J = JSON.stringify;
  const head = Object.keys(d).filter(k => k !== 'regions' && k !== 'rooms').map(k => `  ${J(k)}: ${J(d[k])}`);
  const regions = d.regions.map(r => '    ' + J(r)).join(',\n');
  const rooms = d.rooms.map(r => {
    const meta = Object.assign({}, r); delete meta.items;
    return '    { ' + Object.keys(meta).map(k => `${J(k)}: ${J(meta[k])}`).join(', ') + ',\n      "items": [\n' + r.items.map(i => '        ' + J(i)).join(',\n') + '\n      ] }';
  }).join(',\n');
  return '{\n' + head.join(',\n') + ',\n  "regions": [\n' + regions + '\n  ],\n  "rooms": [\n' + rooms + '\n  ]\n}\n';
};
