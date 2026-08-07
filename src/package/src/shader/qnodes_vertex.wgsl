// Vertex shader for Q-sphere colored nodes and spokes. The color is passed through
// unchanged instead of being treated as a surface normal.
struct Uniforms {
    projMatrix: mat4x4f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
};

@group(0)
@binding(0)
var<uniform> uniforms: Uniforms;

@vertex
fn main(
    @location(0) position: vec3f,
    @location(1) color: vec4f
) -> VertexOutput {
    var out: VertexOutput;
    out.position = uniforms.projMatrix * vec4f(position, 1.0);
    out.color = color;
    return out;
}
