import {
  ActivityTransition,
  type ActivityTransitionOptions,
  BaseClock,
  type ClockPort,
  type GateReadablePort,
  type PhysicsPort,
  type SimulationState,
} from "../domain";

type DialogGateClockOptions =
  | {
      type?: "modal";
      closedby?: "any" | "closerequest" | "none" | "manual";
    }
  | {
      type?: "modeless";
      closedby?: "closerequest" | "none" | "manual";
    }
  | {
      // popoverによりtoplayerにmodelessなdialogを表示する。
      type?: "popover";
      closedby?: "closerequest" | "none" | "manual";
    };

/**
 * dialog要素を制御するClockPortです。開いているときはgateが1、閉じているとき（requestClose, close）はgateが0になります。
 * silentClose()はClockを起動せずにDialogを閉じるためのメソッドです。DialogSilentClosePhysics によりダイアログを実際に終了することを想定しています。
 * typeオプションで、modal, modeless, popoverのいずれかの表示方法を選択できます。popoverはブラウザがサポートしている場合に利用可能です。
 * closedbyオプションで、ユーザ操作によるダイアログの閉じ方を指定できます。
 */
export class DialogGateClock extends BaseClock implements ClockPort, GateReadablePort {
  private state: "open" | "request-close" | "close" = "close";
  private _snapshot: 0 | 1 = 0;

  private _show: () => void = () => {};
  private _close: () => void = () => {};

  private _onEscape: null | ((e: KeyboardEvent) => void) = null;
  private _onBackdropClick: null | ((e: MouseEvent) => void) = null;
  private _onNativeClose: null | (() => void) = null;
  constructor(
    private target: HTMLDialogElement,
    // type: 未指定の場合、modal
    // htmlの保証するイベントを無視、HTML属性をnoneに固定しJS制御によるrequestCloseを実行する
    // manual指定の場合、HTML属性指定JS制御を行わない。デフォルトで none。
    options: DialogGateClockOptions = {},
  ) {
    super();
    if (options.type === "popover" && !DialogGateClock.enablePopoverSupport(target)) {
      console.warn(
        "The target dialog does not support popover. Falling back to modeless behavior.",
      );
      options = { type: "modeless", closedby: options.closedby };
    }

    switch (options.type) {
      case "modal":
        this._show = () => this.target.showModal();
        this._close = () => this.target.close();
        break;
      case "modeless":
        this._show = () => this.target.show();
        this._close = () => this.target.close();
        break;
      case "popover":
        this._show = () => this.target.showPopover();
        this._close = () => this.target.hidePopover();
        // autoの場合、close を拾いきれないため、manual固定。
        this.target.popover = "manual";
        break;
      default:
        this._show = () => this.target.showModal();
        this._close = () => this.target.close();
    }
    switch (options.closedby) {
      case "any":
        this._onEscape = (e) => this.onEscape(e);
        this._onBackdropClick = (e) => this.onBackdropClick(e);
        this.target.setAttribute("closedby", "none");
        break;
      case "none":
        this.target.setAttribute("closedby", "none");
        break;
      case "closerequest":
        this._onEscape = (e) => this.onEscape(e);
        this.target.setAttribute("closedby", "none");
        break;
      case "manual":
        // HTML属性指定JS制御を行わない
        // stateの内部状態が実態とずれ、再openが不可能になるため、
        // dialogのcloseイベントを監視する
        this._onNativeClose = () => {
          if (this.state === "close") return;
          this.state = "close";
          this._removeListeners();
          this._heartbeat();
        };
        break;
      default:
        this.target.setAttribute("closedby", "none");
    }
  }
  public open() {
    if (!this.target.isConnected || this.state === "open") return;
    this._show();
    this.state = "open";
    if (this._onEscape) document.addEventListener("keydown", this._onEscape);
    if (this._onBackdropClick) this.target.addEventListener("click", this._onBackdropClick);
    if (this._onNativeClose) this.target.addEventListener("close", this._onNativeClose);
    this._heartbeat();
  }
  // Clockを起動しダイアログを閉じることを要求する
  public requestClose() {
    if (!this.target.isConnected || this.state !== "open") return;
    this.state = "request-close";
    this._heartbeat();
  }
  // Clockを起動せずにDialogを閉じる
  public silentClose() {
    if (!this.target.isConnected || this.state === "close") return;
    this.state = "close";
    this._removeListeners();
    this._close();
  }
  // Dialogを閉じる
  public close() {
    if (!this.target.isConnected || this.state === "close") return;
    this.state = "close";
    this._removeListeners();
    this._close();
    this._heartbeat();
  }
  public destroy() {
    this._removeListeners();
  }
  public snapshot() {
    this._snapshot = this.state === "open" ? 1 : 0;
  }
  public get gate() {
    return this._snapshot;
  }
  public static enablePopoverSupport(dialog: HTMLDialogElement) {
    return "showPopover" in dialog && "hidePopover" in dialog;
  }
  private _removeListeners() {
    if (this._onEscape) document.removeEventListener("keydown", this._onEscape);
    if (this._onBackdropClick) this.target.removeEventListener("click", this._onBackdropClick);
    if (this._onNativeClose) this.target.removeEventListener("close", this._onNativeClose);
  }
  private onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.requestClose();
    }
  }
  private onBackdropClick(e: MouseEvent) {
    if (e.target !== this.target) return;
    const rect = this.target.getBoundingClientRect();
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.bottom &&
      rect.left <= e.clientX &&
      e.clientX <= rect.right;
    if (!isInDialog) {
      this.requestClose();
    }
  }
}

type DialogSilentClosePhysicsOptions = ActivityTransitionOptions;

/**
 * DialogGateClockの状態とアクティビティレベルに基づいて、ダイアログを自動的に閉じるPhysicsPortです。
 * DialogGateClockのgateが0（close状態）で、アクティビティレベルがstopThresholdを下回ったときに、十分にシミュレーションが実行されたと判定し、DialogGateClockのsilentCloseを呼び出します。
 * 呼び出し元では、DialogGateClockをtargetの依存関係に追加しsnapshotされることを保証してください。
 * また、DialogGateClockでユーザアクションなどなんらかのイベントによりrequestCloseが呼び出されたあとに、DialogSilentClosePhysics によりダイアログを実際に終了することを想定しています。
 */
export class DialogSilentClosePhysics implements PhysicsPort {
  private readonly activityTransition: ActivityTransition;
  constructor(
    private readonly dialogClock: DialogGateClock,
    options: DialogSilentClosePhysicsOptions = {},
  ) {
    this.activityTransition = new ActivityTransition(options);
  }
  public apply(state: SimulationState) {
    const act = this.activityTransition.update(state.activityLevel);
    if (act.stopped && this.dialogClock.gate === 0) {
      this.dialogClock.silentClose();
    }
  }
}
