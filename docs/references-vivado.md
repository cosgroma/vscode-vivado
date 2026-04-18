I looked up the official AMD/Xilinx references and sanity-checked the local install. This machine has:

```text
Vivado v2021.2 (64-bit)
SW Build 3367213
IP Build 3369179
```

`settings.bat` also makes these available locally: `vivado`, `xvhdl`, `xvlog`, `xelab`, and `xsim`.

**Key References**

- [UG973: Vivado 2021.2 Release Notes, Installation, and Licensing](https://docs.amd.com/r/2021.2-English/ug973-vivado-release-notes-install-license/Download-and-Installation)
- [AMD/Xilinx Vivado What’s New, 2021.2 section](https://www.amd.com/en/products/software/adaptive-socs-and-fpgas/vivado/vivado-whats-new.html)
- [UG892: Vivado 2021.2 Design Flows Overview](https://docs.amd.com/r/2021.2-English/ug892-vivado-design-flows-overview/Vivado-System-Level-Design-Flows)
- [UG894: Vivado 2021.2 Tcl Scripting](https://docs.amd.com/r/2021.2-English/ug894-vivado-tcl-scripting)
- [UG896: Vivado 2021.2 Designing with IP](https://docs.amd.com/r/2021.2-English/ug896-vivado-ip)
- [UG994: Vivado 2021.2 IP Integrator](https://docs.amd.com/r/2021.2-English/ug994-vivado-ip-subsystems)
- [UG900: Vivado 2021.2 Logic Simulation](https://docs.amd.com/r/2021.2-English/ug900-vivado-logic-simulation/Simulating-with-Vivado-Simulator)
- [UG908: Vivado 2021.2 Programming and Debugging](https://docs.amd.com/r/2021.2-English/ug908-vivado-programming-debugging)

**Feature Map**
Vivado 2021.2 is a full FPGA/SoC implementation environment: RTL elaboration, synthesis, implementation, timing closure, bitstream generation, IP packaging, IP integration, simulation, hardware programming, and in-system debug. UG892 frames the major workflows as RTL-to-bitstream, IP-centric/system-level design, embedded processor design, C/HLS-based design, Dynamic Function eXchange, and hierarchical design.

The 2021.2-specific “What’s New” highlights include Artix UltraScale+ device enablement for `XCAU20P` and `XCAU25P`, Vitis HLS timing/QoR improvements, HLS throughput constraints, HLS interface-adaptor reporting, new HLS analysis views, IP enhancements, Intelligent Design Runs reporting improvements, and ML-based placer directive prediction.

For this repo, the most relevant pieces are probably Vivado/XSim, IP Integrator, IP packaging/IP-XACT, AXI-aware debug/simulation, and Tcl batch automation.

**Interfaces**
Vivado exposes several useful interfaces:

- **Shell activation:** `settings64.bat` / `settings64.sh` set up the Vivado environment. Our `settings.bat` now finds the pinned 2021.2 install and calls this.

- **Command-line tools:** `vivado`, `xvhdl`, `xvlog`, `xelab`, `xsim`, plus support tools for programming, simulation libraries, and hardware debug.

- **GUI interface:** the Vivado IDE for project management, IP configuration, timing/debug views, waveform analysis, Hardware Manager, and implementation runs.

- **Tcl API:** probably the most important automation interface. Vivado can run interactively with `vivado -mode tcl` or headless with:

  ```cmd
  vivado -mode batch -source script.tcl -tclargs ...
  ```

  The Tcl API exposes projects, filesets, runs, cells, nets, pins, ports, clocks, timing paths, reports, IP, block designs, hardware targets, and simulator state.

- **Design artifacts:** `.xpr` projects, `.xci` IP customizations, `.bd` block designs, `.dcp` design checkpoints, `.xdc` constraints, `.bit` bitstreams, simulation scripts, and exported hardware/platform metadata.

- **IP and system integration:** Vivado IP Catalog, IP Packager, IP-XACT metadata, IP Integrator block designs, board files, AXI interface inference, block automation, connection automation, address maps, and Vitis platform export hooks.

- **Simulation interfaces:** integrated Vivado Simulator and standalone `xvhdl` / `xvlog` / `xelab` / `xsim`. UG900 documents functional and timing simulation, mixed VHDL/Verilog/SystemVerilog, waveform viewing, VCD/SAIF dumping, Xilinx simulation libraries, SystemVerilog DPI, SystemC support, and Xilinx Simulator Interface (XSI) for C/C++ test harnesses.

- **AXI visibility:** UG900 specifically calls out AXI Memory-Mapped and AXI4-Stream transaction analysis in the simulator waveform flow, which is tasty for this repo’s AXI-stream packet and Vivado VIP calibration work.

- **Hardware/debug:** UG908 covers Hardware Manager, `hw_server`, JTAG targets, configuration memory programming, SVF generation, ILA, VIO, IBERT, JTAG-to-AXI, AXI4 Debug Hub, System ILA, Debug Bridge, XVC, readback/verify, and Lab Edition.

## Note

The docs worth keeping closest are UG900 for XSim, UG994/UG896 for IP/IP Integrator, UG894 for Tcl automation, and UG908 for hardware/debug. A good next step would be to add a small repo note that maps these references directly to the existing GENCOR Vivado/XSim scripts and Make targets.
