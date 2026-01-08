import { useNavigate } from "react-router-dom";

type Props = {
    label?: string;
    className?: string;
};

export default function BackButton({ label = "← Retour", className }: Props) {
    const navigate = useNavigate();

    function handleBack() {
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate("/");
    }

    return (
        <button type="button" onClick={handleBack} className={className}>
            {label}
        </button>
    );
}
