// 换天：旧的那一面盖在上面，从人身上起一圈往外“洇开”，圈里露出新的一面。
// 圈边三道 4 像素宽的抖动带（75% / 50% / 25%），全部在 320×180 的像素格上算，不出半像素。
shader_type canvas_item;

uniform vec2 center = vec2(160.0, 90.0);
uniform float radius = 0.0;

void fragment() {
	vec2 size = vec2(textureSize(TEXTURE, 0));
	vec2 p = floor(UV * size);
	float d = length(p + vec2(0.5) - center);
	int n = 0;
	if (d < radius - 12.0) { n = 4; }
	else if (d < radius - 8.0) { n = 3; }
	else if (d < radius - 4.0) { n = 2; }
	else if (d < radius) { n = 1; }
	int ix = int(mod(p.x, 2.0));
	int iy = int(mod(p.y, 2.0));
	int idx = (ix == 0 && iy == 0) ? 0 : ((ix == 1 && iy == 1) ? 1 : ((ix == 1 && iy == 0) ? 2 : 3));
	if (idx < n) { discard; }
	COLOR = texture(TEXTURE, UV);
}
