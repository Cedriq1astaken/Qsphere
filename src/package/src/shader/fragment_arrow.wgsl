// Purple shaded arrow used by the Bloch renderers.
struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    // Quantum purple base colour
    let baseColor = vec3f(0.55, 0.12, 0.88);

    // Depth-based darkening (same idea as the sphere shader)
    let depthFactor = mix(1.0, 0.45, in.position.z);

    // Simple directional + ambient lighting for a solid 3-D look
    let N = normalize(in.normal);
    let lightDir = normalize(vec3f(0.3, 0.5, 1.0));
    let diffuse  = max(dot(N, lightDir), 0.0);
    let ambient  = 0.35;
    let lighting = ambient + (1.0 - ambient) * diffuse;

    return vec4f(baseColor * depthFactor * lighting, 1.0);
}
