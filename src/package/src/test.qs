namespace QuantumApp {
    import Std.Diagnostics.DumpMachine;
    open Microsoft.Quantum.Intrinsic;
    @EntryPoint()
    operation Main() : Unit {
        use q = Qubit();
        use q2 = Qubit();
        H(q);
        test(q);
        Ry(0.5, q);

        H(q2);
        CNOT(q2, q);
        Reset(q);
        Reset(q2);
    }

    operation test(q: Qubit) : Unit {
        Ry(0.5, q);        
        Ry(0.5, q);        
        Ry(0.5, q);        
        I(q);       
    }
}