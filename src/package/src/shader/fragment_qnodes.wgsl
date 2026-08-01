struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let col = in.normal;
    return vec4f(col, 1.0);
}
