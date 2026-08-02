namespace QuantumApp {
    import Std.Diagnostics.DumpMachine;
    open Microsoft.Quantum.Intrinsic;
    @EntryPoint()
    operation Main() : Unit {
        use q = Qubit[2];
        test(q);
        ResetAll(q);
    }

    operation test(q: Qubit[]) : Unit {
        H(q[0]);
        X(q[1]);
        H(q[1]);
    }
}