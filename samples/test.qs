namespace QsphereTest {
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Math;

    @EntryPoint()
    operation Main() : Unit {
        use q = Qubit[3];
        Ry(2.0 * PI() / 3.0, q[0]);
        Ry(2.0 * PI() / 3.0, q[1]);
        Rz(2.0 * PI() / 3.0, q[0]);
        CZ(q[1], q[0]);
        S(q[1]);
        SWAP(q[0], q[1]);

        
        ResetAll(q);
    }
}
