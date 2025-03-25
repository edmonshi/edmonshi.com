interface ListGroupProps {
    message: string;
  }

function Message({message}: ListGroupProps) {
    return <h2>{message}</h2>;
}

export default Message; 