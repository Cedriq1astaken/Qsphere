struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let baseColor = vec3f(0.788, 0.788, 0.788);

    let depthFactor = mix(1.0, 0.35, in.position.z);

    let N = normalize(in.normal);
    let centerFactor = max(N.z, 0.0);
    let alpha = mix(0.8, 0.2, centerFactor);

    return vec4f(baseColor * depthFactor, alpha);
}
