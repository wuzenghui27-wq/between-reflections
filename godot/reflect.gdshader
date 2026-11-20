// 倒影：静水里映出的是另一面的世界。贴图是另一面这一景的底层图；水线以下、没被地面挡住的格子（mask）里，
// 按水线上下翻过来取像素。只翻转不缩放；涟漪是整像素的错行。和 Unity 版 Painter.Reflection 同一公式。
shader_type canvas_item;

uniform sampler2D mask : filter_nearest;
uniform int wy = 140;
uniform float t = 0.0;
uniform bool night = false;

void fragment() {
	ivec2 size = textureSize(TEXTURE, 0);
	ivec2 p = ivec2(floor(UV * vec2(size)));
	if (p.y <= wy || texelFetch(mask, p, 0).r < 0.5) { discard; }
	int depth = p.y - wy;
	int sy = wy - depth;
	float a = max(0.0, (night ? 0.6 : 0.45) - float(depth) * 0.012);
	a = floor(a * 8.0) / 8.0;
	if (sy < 0 || a <= 0.0) { discard; }
	int sh = depth <= 2 ? 0 : int(round(sin(float(depth) * 0.8 + t * 2.5) * 1.2));
	int sx = p.x + sh;
	if (sx < 0 || sx >= size.x) { discard; }
	vec4 c = texelFetch(TEXTURE, ivec2(sx, sy), 0);
	COLOR = vec4(c.rgb, c.a * a);
}
