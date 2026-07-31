struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let lineColor = vec3f(0.55, 0.55, 0.65);
    return vec4f(lineColor, 0.5);
}
