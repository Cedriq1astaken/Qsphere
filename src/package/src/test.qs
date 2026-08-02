namespace QuantumApp {
    import Std.Math.PI;
    import Std.Diagnostics.DumpMachine;
    open Microsoft.Quantum.Intrinsic;
    @EntryPoint()
    operation Main() : Unit {
        use q = Qubit[2];
        test(q);
        ResetAll(q);
    }

    operation test(q: Qubit[]) : Unit {
        Ry(PI() / 3.0 ,q[0]);
        CNOT(q[0], q[1]);
        DumpMachine();
    }
}