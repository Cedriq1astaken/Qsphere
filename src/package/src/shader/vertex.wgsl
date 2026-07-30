struct Uniforms {
    projMatrix: mat4x4f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
};


@group(0)
@binding(0)
var<uniform> uniforms: Uniforms;

@vertex
fn main(
    @location(0) position: vec3f,
    @location(1) normal: vec3f
) -> VertexOutput {
    var out: VertexOutput;
    
    out.position = uniforms.projMatrix * vec4f(position, 1.0);
    out.normal = normalize((uniforms.projMatrix * vec4f(normal, 0.0)).xyz);
    
    return out;
}
