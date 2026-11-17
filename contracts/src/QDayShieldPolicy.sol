// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract QDayShieldPolicy {
    address public immutable owner;
    address public reviewer;

    uint256 public constant PER_TX_LIMIT = 0.01 ether;
    uint256 public constant CUMULATIVE_LIMIT = 0.05 ether;
    uint256 public constant APPROVAL_THRESHOLD = 0.005 ether;
    uint256 public constant APPROVAL_VALIDITY = 1 hours;

    uint256 public totalSpent;
    uint256 public transferNonce;
    bool public emergencyPaused;

    mapping(address => bool) public allowedRecipients;
    mapping(bytes32 => uint256) public approvedUntil;

    uint256 private locked = 1;

    event RecipientUpdated(address indexed recipient, bool allowed);
    event ReviewerUpdated(address indexed reviewer);
    event EmergencyPauseChanged(bool paused);

    event TransferApproved(
        bytes32 indexed requestHash,
        address indexed recipient,
        uint256 amount,
        uint256 expiresAt
    );

    event TransferExecuted(
        address indexed recipient,
        uint256 amount,
        uint256 nonce
    );

    event EmergencyRecovery(
        address indexed owner,
        uint256 amount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier notPaused() {
        require(!emergencyPaused, "Emergency pause active");
        _;
    }

    modifier nonReentrant() {
        require(locked == 1, "Reentrant call");
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address initialReviewer) {
        require(initialReviewer != address(0), "Invalid reviewer");
        require(initialReviewer != msg.sender, "Owner cannot be reviewer");

        owner = msg.sender;
        reviewer = initialReviewer;
    }

    receive() external payable {}

    function setRecipient(
        address recipient,
        bool allowed
    ) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");

        allowedRecipients[recipient] = allowed;

        emit RecipientUpdated(recipient, allowed);
    }

    function setReviewer(
        address newReviewer
    ) external onlyOwner {
        require(newReviewer != address(0), "Invalid reviewer");
        require(newReviewer != owner, "Owner cannot be reviewer");

        reviewer = newReviewer;

        emit ReviewerUpdated(newReviewer);
    }

    function setEmergencyPause(
        bool paused
    ) external onlyOwner {
        emergencyPaused = paused;

        emit EmergencyPauseChanged(paused);
    }

    function approveTransfer(
        address recipient,
        uint256 amount
    ) external notPaused {
        require(msg.sender == reviewer, "Not reviewer");
        require(allowedRecipients[recipient], "Recipient not allowed");
        require(amount >= APPROVAL_THRESHOLD, "Approval not required");
        require(amount <= PER_TX_LIMIT, "Per transaction limit exceeded");
        require(
            totalSpent + amount <= CUMULATIVE_LIMIT,
            "Cumulative limit exceeded"
        );

        bytes32 requestHash = keccak256(
            abi.encode(transferNonce, recipient, amount)
        );

        uint256 expiry = block.timestamp + APPROVAL_VALIDITY;

        approvedUntil[requestHash] = expiry;

        emit TransferApproved(
            requestHash,
            recipient,
            amount,
            expiry
        );
    }

    function executeTransfer(
        address payable recipient,
        uint256 amount
    ) external onlyOwner notPaused nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(allowedRecipients[recipient], "Recipient not allowed");
        require(amount > 0, "Invalid amount");
        require(amount <= PER_TX_LIMIT, "Per transaction limit exceeded");

        require(
            totalSpent + amount <= CUMULATIVE_LIMIT,
            "Cumulative limit exceeded"
        );

        require(
            address(this).balance >= amount,
            "Insufficient vault balance"
        );

        bytes32 requestHash = keccak256(
            abi.encode(transferNonce, recipient, amount)
        );

        if (amount >= APPROVAL_THRESHOLD) {
            uint256 expiry = approvedUntil[requestHash];

            require(
                expiry > block.timestamp,
                "Approval missing or expired"
            );

            delete approvedUntil[requestHash];
        }

        totalSpent += amount;

        uint256 executedNonce = transferNonce;
        transferNonce++;

        (bool success, ) = recipient.call{value: amount}("");

        require(success, "Transfer failed");

        emit TransferExecuted(
            recipient,
            amount,
            executedNonce
        );
    }

    // Emergency recovery: owner can recover remaining funds
    // only after emergency pause is activated.
    function emergencyRecover()
        external
        onlyOwner
        nonReentrant
    {
        require(emergencyPaused, "Pause must be active");

        uint256 balance = address(this).balance;

        require(balance > 0, "No funds to recover");

        (bool success, ) = payable(owner).call{value: balance}("");

        require(success, "Recovery failed");

        emit EmergencyRecovery(owner, balance);
    }

    function getVaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getRequestHash(
        address recipient,
        uint256 amount
    ) external view returns (bytes32) {
        return keccak256(
            abi.encode(transferNonce, recipient, amount)
        );
    }
}