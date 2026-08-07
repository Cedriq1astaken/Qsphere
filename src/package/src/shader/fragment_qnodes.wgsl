// Q-sphere nodes and spokes carry their final phase color as a vertex attribute.
// No lighting is applied here, so rotating the sphere cannot change the color.
struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    return in.color;
}
