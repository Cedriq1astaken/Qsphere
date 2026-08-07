// Transparent shaded sphere surface. Depth and normal-based alpha keep the sphere
// readable without hiding the axes and state arrow behind an opaque fill.
struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let baseColor = vec3f(0.92, 0.92, 0.92);

    let depthFactor = mix(1.0, 0.52, in.position.z);

    let N = normalize(in.normal);
    let centerFactor = max(N.z, 0.0);
    let alpha = mix(0.6, 0.2, centerFactor);

    return vec4f(baseColor * depthFactor, alpha);
}
