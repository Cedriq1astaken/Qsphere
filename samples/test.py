from qiskit import QuantumCircuit
import numpy as np

qc = QuantumCircuit(3)

qc.h(0)
qc.cx(0, 1)
qc.cx(1, 2)

qc.rz(np.pi / 4, 0)
