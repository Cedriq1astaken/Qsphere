namespace QsphereTest {
    // Standard library namespaces used by the sample operations.
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Math;

    // Default sample executed when the visualizer is opened without an active file.
    @EntryPoint()
    operation Main() : Unit {   
        use q = Qubit[3];
        H(q[0]);
        CNOT(q[0], q[1]);
        CNOT(q[1], q[2]);
        Ry(PI() / 4.0, q[0]);


        ResetAll(q);
    }
}
